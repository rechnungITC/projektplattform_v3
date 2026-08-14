# PROJ-80: RAG-Indexierung + Quintessenz

## Status: Architected (α)
## Deployment Scope: —
**Created:** 2026-06-06
**Last Updated:** 2026-08-14

> **Zuschnitt 2026-08-14:** geteilt in **α — Quintessenz ohne Vektor** (dieses Tech Design) und
> **β — Retrieval** (Vektorindex, Embeddings, pgvector; zurückgestellt, bis das DMS Dokumente enthält).
> Die Akzeptanzkriterien unten sind noch die Fassung vom 2026-06-07 und decken beide Hälften ab; welche
> davon zu α gehören, steht im Tech Design. Sie werden **nicht** umgeschrieben — die β-Kriterien sind
> zurückgestellt, nicht erledigt.

## Summary
On top of the raw DMS (PROJ-79), this story adds the AI-side enrichment. When a document is uploaded or created, the system extracts its text, chunks it, embeds it into a per-tenant vector index, and a dedicated Summarizer Skill produces a **Quintessenz** — a structured short summary stored alongside the document. When an agent later retrieves context for a follow-up task that links to that document, the PM picks between **deep mode** (full text via retrieval) and **context mode** (Quintessenz only).

## Dependencies
- Requires: PROJ-79 (DMS Foundation)
- Requires: PROJ-76 (Skill-Framework) — Summarizer is a built-in cross-cutting Skill
- Requires: PROJ-12 (AI Proposal Layer) — Summarizer invocation reuses the agent infrastructure
- Influences: PROJ-81 (Skill-to-RAG-Scope) — retrieval is scoped through it
- Influences: PROJ-82, PROJ-83 — both consume retrieval output

## V2 Reference Material
- None.
- ADR to be created: `docs/decisions/rag-architecture.md`, `docs/decisions/quintessenz-schema.md`.

## User Stories
- **[V3 SK-19]** As the system, I want to extract, chunk, and embed every supported uploaded document, so that agents can retrieve relevant passages by semantic search.
- **[V3 SK-20]** As the system, I want a Summarizer Skill to produce a Quintessenz for every document right after indexing, so that agents have a compact context object available without reading the full text.
- **[V3 SK-21]** As a PM, when I am working on a task that references a related document, I want to choose between reading the full document (deep) or just its Quintessenz (context), so that I can balance precision and speed.
- **[V3 SK-22]** As a PM, I want the Quintessenz to be visible and editable on the document detail page, so that I can correct it if the auto-generation got something wrong.

## Acceptance Criteria

### Indexing pipeline
- [ ] On `document.uploaded` event (PROJ-79), an async job triggers extraction:
  - PDF → `pdfjs-dist` direct (same CIA-approved parser family as PROJ-70; do not reintroduce `pdf-parse`)
  - DOCX → `mammoth` (already available in the PROJ-70 artifact stack)
  - XLSX → `SheetJS`
  - MD/TXT/CSV → direct read
  - PPTX → text-only extract
- [ ] Failed extraction (e.g. scanned PDF without text layer) → document marked `text_extraction_status='failed'`; surfaced in DMS UI; no indexing attempted (OCR explicitly out of scope V1).
- [ ] Successful extraction → text is chunked (target 800 tokens, overlap 100; tunable) and embeddings stored in `document_chunks` table with vector column.

### Data model
- [ ] Table `document_chunks`: `id UUID PK, tenant_id UUID NOT NULL, document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE, chunk_index INT NOT NULL, content TEXT NOT NULL, embedding vector(1536), token_count INT, created_at`. Vector index via pgvector.
- [ ] Table `document_summaries`: `id UUID PK, tenant_id UUID NOT NULL, document_id UUID NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE, structured_summary JSONB NOT NULL, summary_markdown TEXT NOT NULL, generated_by_skill_version_id UUID REFERENCES skill_versions(id), generated_at TIMESTAMPTZ, edited_by_user_id UUID, edited_at TIMESTAMPTZ, status TEXT CHECK (status IN ('auto','user_edited','stale'))`.
- [ ] `structured_summary` JSONB schema (V1): `{ title, key_topics: [], entities: [{name, type}], summary_paragraphs: [], references: [], language }`.

### Summarizer Skill (built-in)
- [ ] Ships with seeded built-in Skill `summarizer` (category `cross_cutting`, active by default in every tenant).
- [ ] Admin can override the markdown but cannot delete it (V1).
- [ ] Invocation pattern: when indexing completes, the orchestrator calls Summarizer with the extracted text + frontmatter instructions; result written to `document_summaries`.
- [ ] On Summarizer failure → `document_summaries` row created with `status='stale'` and empty summary; surfaced in UI with "Quintessenz nicht erzeugt" + retry button.

### Re-summarization on re-upload
- [ ] If a document with the same `tree_node_id` is re-uploaded (overwrite), chunks and summary are invalidated and re-generated; `status='stale'` during regeneration.

### Deep vs Quintessenz toggle
- [ ] In a task UI that links to one or more documents (link table specified in PROJ-9 or here as `task_document_links`), a per-link toggle "Vollständig / Quintessenz" is shown.
- [ ] Default: Quintessenz. Per-tenant default configurable in admin settings (cross-batch open question).
- [ ] When an agent acts on this task (via PROJ-82 or PROJ-83), the chosen mode determines whether the retrieval call returns top-k matched chunks or just the Quintessenz markdown.

### Document detail page
- [ ] Shows document metadata + tabbed view: Vorschau / Quintessenz / Verlinkungen.
- [ ] Quintessenz tab shows the auto-generated markdown editable inline; save promotes status to `user_edited` and stops further auto-regeneration unless admin force-re-runs.

### Audit
- [ ] Events: `document.indexed`, `document.indexing_failed`, `document.summary_generated`, `document.summary_edited`, `task.retrieval_invoked` (with mode `deep|context`).

## Edge Cases
- **Scanned PDF with no text layer** → indexing skipped; document still browsable, no Quintessenz; PM sees explicit note.
- **Document larger than 50 MB** → blocked at upload (PROJ-79).
- **Embedding model unavailable / API outage** → job retries with exponential backoff up to 24 h; persistent failure surfaces in admin alert.
- **User edits Quintessenz then re-uploads document** → previous user edit is preserved unless PM explicitly opts into regeneration.
- **PII appears in chunks** → tagged via PROJ-84 data-class metadata; affects retrieval permissioning (out of scope of this story but contract honored).
- **Summarizer skill is deactivated by admin** → indexing still runs; summary row created with `status='stale'` and a clear "Summarizer Skill nicht aktiv" notice.
- **Two PMs simultaneously edit Quintessenz** → optimistic concurrency via `If-Match: <edited_at>`; one of them gets 409.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase (DB with pgvector extension); background job runner (Supabase Edge Functions or queue, decide in /architecture).
- **Embedding provider:** decide in /architecture per ADR `data-privacy-classification` — local model for `internal`-classified data, Anthropic/OpenAI for `general`.
- **Text extraction libraries:** reuse the PROJ-70 hardening baseline where possible (`pdfjs-dist`, `mammoth`, magic-byte sniffing, parser timeouts, no raw parser-output logs); decide XLSX/PPTX libraries in /architecture.
- **Multi-tenant:** every table carries `tenant_id`; pgvector index per tenant or single index with `tenant_id` filter (decide in /architecture).
- **Validation:** Zod for summary JSONB schema; structured summary must conform before write.
- **Auth:** read-summary follows document RLS; edit requires project_lead or editor role.
- **Performance:** target indexing job latency ≤ 5 min for 50 MB document; summary latency ≤ 90 s typical.
- **Audit hook:** PROJ-10.

## Out of Scope
- OCR for scanned PDFs (V2).
- Multi-modal indexing (images, audio) — V2.
- Cross-document summarization ("summarize all risk reports") — V2.
- Per-skill summary variants (one Quintessenz per document, not per consumer) — V2.
- User-facing chunk-level browsing.
- Summarizer evaluation harness (precision/recall metrics) — V2.

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

**Stand 2026-08-14.** Die Spec ist vom 2026-06-07 und damit älter als mehrere deployte Slices. Vor dem
Entwurf wurde jede ihrer Annahmen gegen die laufende Datenbank und den Code geprüft; fünf halten nicht mehr.
Das Design folgt dem gemessenen Stand, nicht dem Spec-Text.

### Was sich seit dem Schreiben der Spec geändert hat

| Spec-Annahme | Gemessener Stand 2026-08-14 | Folge fürs Design |
|---|---|---|
| pgvector steht bereit | **Nicht installiert** (verfügbar 0.8.0) | Wäre eine neue Extension in Produktion → nach β verschoben |
| Dokumente sind wie Kontext-Quellen klassifiziert | **Dokumente tragen gar keine Klassifikation**; der Upload-Pfad ruft keinen Klassifizierer | Eigener Block in α (siehe „Datenschutz") |
| Der AI-Router kann Embeddings | **Kann er nicht** — alle sechs Anbieter sind reine Text-Erzeugung | Embedding ist Neuland → β |
| Vertraulichkeit hängt am Dokument | Sie hängt **am Baumknoten** (PROJ-Y-115c), Dokumente erben darüber | Neue Tabellen erben über denselben Weg, nicht über eine zweite Kopie |
| Ein Job-Runner ist wählbar | Es gibt **keine Queue** — 6 Vercel-Crons, 1 Edge Function | Haus-Muster statt neuer Infrastruktur |
| `skills.category` kennt `cross_cutting` | ✅ **hält** | Summarizer wird ein gewöhnlicher Skill |

Dazu ein Befund, der kein Design-Problem ist, aber die Reihenfolge bestimmt: **das DMS ist in Produktion
leer** — 0 Dokumente, 0 Baumknoten, drei Wochen nach dem α-Deploy von PROJ-79.

### Zuschnitt: α liefert die Quintessenz, β den Vektorindex

**Nutzer-Entscheid 2026-08-14.** PROJ-80 wird geteilt.

**α — Quintessenz ohne Vektor.** Hochladen → Text herauslösen → klassifizieren → Summarizer-Skill erzeugt
die Quintessenz → Dokument-Detailseite mit Vorschau/Quintessenz/Verlinkungen → Umschalter „Vollständig /
Quintessenz" am verknüpften Dokument. **Kein pgvector, keine Embeddings, kein neuer Dependency.**

**β — Retrieval.** `document_chunks`, pgvector, Embedding-Weg im AI-Layer, top-k-Retrieval. Erst bauen,
wenn im DMS wirklich Dokumente liegen — vorher ist es ein Index über nichts.

Der Schnitt trägt, weil die Spec selbst zwei Modi kennt und **nur einer** Retrieval braucht: „Kontext" ist
die Quintessenz, und die entsteht ohne Vektorsuche. In α bedeutet „Vollständig" schlicht *der ganze
herausgelöste Text* — den haben wir nach der Extraktion ohnehin. β ersetzt das später durch *die k
passendsten Stellen*, was erst nötig wird, wenn Dokumente zu groß sind, um sie ganz mitzugeben. Der
Umschalter aus SK-21 funktioniert also ab α, und β verfeinert nur, was hinter „Vollständig" passiert.

### Ablauf in α

```
Dokument-Upload (PROJ-79, unverändert)
 |
 +-- sofort:  Text herauslösen        (PDF · DOCX · MD/TXT/CSV)
 |            |
 |            +-- kein Textlayer?  -> Status "fehlgeschlagen", sichtbar im DMS,
 |                                    kein Weiterlauf (OCR bleibt draußen)
 |
 +-- dann:    Datenschutz-Klassifikation über den ganzen Text  (PROJ-75-Muster)
 |            |
 |            +-- personenbezogen?  -> nur mandanteneigene Anbieter zulässig
 |
 +-- dann:    Summarizer-Skill erzeugt die Quintessenz
 |            |
 |            +-- kein zulässiger Anbieter / Fehler
 |                -> Zeile mit Status "nicht erzeugt" + nachvollziehbarer Grund
 |                   + Knopf "erneut versuchen"   (kein stilles Nichts)
 |
 +-- Ergebnis sichtbar auf der Dokument-Detailseite
```

Angestoßen wird der Ablauf **direkt nach dem Upload** im Hintergrund der Anfrage — dasselbe Mittel, das
PROJ-54 für die Nachberechnung der Tagessätze nutzt. Ein **nächtlich laufender Aufräum-Durchgang** greift
die Fälle nach, die dabei verloren gingen (Absturz, Zeitüberschreitung), analog zum Jira-Eingangslauf.
Bewusst **keine** Queue und **keine** Edge Function: beides wäre neue Infrastruktur für ein Problem, das
das Haus-Muster schon löst.

### Oberfläche

```
Projektraum -> Dokumente        (existiert, PROJ-79)
 +-- Baum + Detailbereich       (existiert)
      +-- NEU: Reiter
           +-- Vorschau         Metadaten wie heute
           +-- Quintessenz      Kurzfassung, direkt bearbeitbar
           |    +-- Status: automatisch | von Hand geändert | nicht erzeugt
           |    +-- "Erneut erzeugen"        (nur Bearbeitungsrechte)
           +-- Verlinkungen     wo dieses Dokument verwendet wird

Aufgabe mit verknüpftem Dokument
 +-- NEU: Umschalter je Verknüpfung   "Vollständig | Quintessenz"
          Voreinstellung: Quintessenz
```

### Daten, in Worten

**Herausgelöster Text** — je Dokument einmal: der Text selbst, womit er herausgelöst wurde, wie lang er
ist, ob es geklappt hat, und wann. Getrennt vom Dokument gehalten, weil er groß ist und beim erneuten
Hochladen komplett ersetzt wird.

**Datenschutz-Merkmale am Dokument** — dieselben drei Angaben, die Kontext-Quellen seit PROJ-75 tragen:
welche Schutzklasse, wann der **ganze** Text geprüft wurde, und ob die Prüfung vollständig möglich war.
Genau dieselbe Bedeutung wie dort, damit es keine zweite Wahrheit gibt.

**Quintessenz** — je Dokument einmal: eine strukturierte Fassung (Titel, Kernthemen, genannte
Beteiligte, Absätze, Verweise, Sprache), dieselbe als lesbarer Text, welche Fassung des Summarizer-Skills
sie erzeugt hat, wann, sowie wer sie zuletzt von Hand geändert hat. Status ist eines von *automatisch*,
*von Hand geändert*, *nicht erzeugt*.

**Vertraulichkeit wird nicht kopiert.** Beide neuen Tabellen hängen am Dokument und erben ihre Stufe über
denselben Weg, den PROJ-Y-115c für Dokumente gebaut hat — der Baumknoten ist die einzige Quelle. Eine
eigene Stufenspalte wäre eine zweite Wahrheit, die auseinanderläuft.

### Datenschutz — der Block, den die Spec nicht kennt

Ein Dokument zusammenzufassen heißt, seinen Text an ein Sprachmodell zu geben. Bisher gibt es auf dem
DMS-Pfad **nichts**, woran Invariante #3 greifen könnte: Dokumente tragen keine Klassifikation, und die
Upload-Route ruft keinen Klassifizierer. Ohne diesen Block wäre PROJ-80 der erste Weg im Produkt, der
ungeprüften Text nach außen gibt.

**Nutzer-Entscheid 2026-08-14:** das Muster aus PROJ-75 wird auf den DMS-Pfad ausgedehnt. Derselbe
Klassifizierer (reine Mustererkennung, **kein** Sprachmodell), dieselbe fail-closed-Haltung, dieselben drei
Angaben. Das ist bewusst kein neues Verfahren, sondern die Ausdehnung eines bereits abgenommenen.

Fällt ein Dokument in die geschützte Klasse, entscheidet der bestehende Anbieter-Auflöser: mandanteneigenes
Ollama oder ein attestierter EU-Prozessor (PROJ-93). Gibt es keinen, wird **kein** Cloud-Aufruf versucht;
die Quintessenz bleibt aus und der Grund steht sichtbar an der Zeile. Das ist der Punkt, an dem PROJ-137
greift: ein leeres Ergebnis muss erklärbar sein, sonst sieht es aus wie „das Dokument gibt nichts her".

### Wie der Summarizer entsteht

Er ist ein **gewöhnlicher Skill** im Sinne von PROJ-76: Kategorie *übergreifend*, je Mandant beim ersten
Bedarf angelegt (dasselbe Nachsäen wie bei den Risiko-Kategorien und den M&A-Vorlagen), von Admins über
den bestehenden Entwurf-und-Veröffentlichen-Weg aus PROJ-77 änderbar, aber **nicht löschbar**.

Der Aufruf selbst ist ein neuer Zweck im bestehenden AI-Router. Daran hängen drei Pflichten, die aus
früheren Fehlern stammen und nicht verhandelbar sind: der Zweck muss **in derselben Migration** in beide
Prüfregeln eingetragen werden (`ki_runs` und die Kostendeckel), er muss von **jedem** Cloud-Anbieter
umgesetzt sein — sonst fällt der Router still auf den leeren Ersatz zurück (PROJ-85) — und jeder Lauf
schreibt einen maschinenlesbaren Grund, wenn nichts herauskommt (PROJ-137). Ein datengetriebener Test über
alle Zwecke und Anbieter hält das offen.

### Was in α bewusst nicht gebaut wird

- **Vektorindex, Chunking, Embeddings, pgvector** → β.
- **XLSX und PPTX.** Beide bräuchten neue Bibliotheken und damit einen eigenen CIA-Durchgang. α bleibt bei
  dem, was die PROJ-70-Härtung schon abdeckt.
- **OCR** → bleibt draußen (Spec), gehört zu PROJ-71.
- **Fachliche Verknüpfungstabelle Aufgabe↔Dokument.** Existiert noch nicht; α zeigt den Umschalter dort,
  wo bereits Verknüpfungen bestehen, und legt kein neues Beziehungsmodell an.

### Abhängigkeiten

**Keine neuen.** `pdfjs-dist` und `mammoth` liegen seit PROJ-70 im Baum, der Klassifizierer seit PROJ-75,
der Skill-Rahmen seit PROJ-76/77, das Vertraulichkeits-Tor seit PROJ-Y-115c. Das ist das stärkste Argument
für diesen Zuschnitt: α ist fast vollständig Wiederverwendung. β wird Dependencies brauchen und dann einen
eigenen CIA-Durchgang.

### Offene Punkte für `/backend`

1. **Wo der herausgelöste Text lebt** — eigene Tabelle (hier vorgeschlagen) oder Spalte am Dokument. Die
   Trennung ist empfohlen, weil der Text beim erneuten Hochladen komplett ersetzt wird.
2. **Obergrenze für „Vollständig"** — ab welcher Textlänge der Modus ablehnt statt das Kostenlimit zu
   sprengen. β löst das über Retrieval; α braucht eine ehrliche Grenze mit sichtbarer Meldung.
3. **Prüfregel für Objektarten im Protokoll** — muss in **derselben** Migration erweitert werden, die die
   Tabellen anlegt, sonst scheitert der erste Schreibvorgang (CLAUDE.md, mehrfach belegt).

### ADRs

- `docs/decisions/quintessenz-schema.md` — Aufbau der strukturierten Kurzfassung und warum sie geprüft
  wird, bevor sie geschrieben wird.
- `docs/decisions/rag-architecture.md` — **erst mit β**, wenn Vektorindex und Embedding-Weg wirklich
  entschieden werden. Ihn jetzt zu schreiben hieße, eine Entscheidung zu dokumentieren, die niemand
  getroffen hat.

## Implementation Notes
_To be added by /frontend and /backend._

## QA Test Results
_To be added by /qa._

## Deployment
_To be added by /deploy._
