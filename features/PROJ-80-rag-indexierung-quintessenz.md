# PROJ-80: RAG-Indexierung + Quintessenz

## Status: In Progress (α gebaut — Backend + Frontend vollständig; `/qa` offen)
## Deployment Scope: —
> Scope bleibt bewusst leer: `Deployed` verlangt eine QA ohne Critical/High, und die hat nicht
> stattgefunden. Zwei Kriterien sind zudem noch offen (echter Anbieter-Lauf, angemeldeter
> Browser-Durchlauf) — siehe „Offenes Kriterium" in den Implementierungsnotizen.

**Created:** 2026-06-06
**Last Updated:** 2026-08-18

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

> **Eingeordnet 2026-08-14 (Nutzer):** die Null ist **kein Adoptionssignal**. Das Produkt ist im
> Entwicklungsstand, es legt schlicht noch niemand Dokumente ab. Der Befund bleibt als Begründung für den
> α/β-Schnitt gültig (ein Vektorindex über null Dokumente wäre verfrüht), taugt aber **nicht** als Beleg
> gegen das DMS. Wer ihn später liest: nicht als Warnsignal deuten.

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

### α.1 /backend — Datenschicht (2026-08-14)

**Zuschnitt-Korrektur beim Bauen.** Der α-Backend war für einen Lauf zu groß. Die AI-Hälfte allein (neuer
Zweck × 6 Anbieter + geteilte Prompts + Capability-Matrix + Lockstep-Migration) war bei PROJ-89 ein
vollständiger `/backend`, die Daten-/Extraktions-Hälfte bei PROJ-70-γ ebenso. Geteilt in:

- **α.1 (dieser Lauf)** — Tabellen, Vertraulichkeits-Vererbung, Audit-Register. Kein AI.
- **α.2** — Extraktion am Upload-Pfad, Volltext-Klassifikation, Summarizer-Zweck, 6 Anbieter, Routen.

**Migration `20260814100000_proj80_alpha1_document_extractions` in Prod.** `document_extractions` +
`document_summaries` + Auflöser `_dms_document_ctx` + 10 Policies + 6 Trigger + Register-Erweiterungen.

**Die drei offenen Punkte aus dem Tech Design, entschieden:**

1. **Ablageort des Volltexts** → eigene Tabelle, **zusammen mit den drei Datenschutz-Feldern**. Der
   Entwurf hatte sie noch trennen wollen; `context_sources` hält `content_excerpt` und `privacy_class`
   aber auf **derselben** Zeile, und das ist der bessere Präzedenzfall: Text und Schutzklasse sind eine
   Tatsache, die beim erneuten Hochladen atomar ersetzt wird. Getrennt könnten sie auseinanderlaufen —
   ein Dokument mit neuem Text und alter Klasse wäre genau das Leck, gegen das Invariante #3 antritt.
   `documents` bleibt schmal, weil es bei jedem Baum-Rendern gelesen wird.
2. **Obergrenze** → **geerbt, nicht erfunden.** `parseFile` weist Text über 2 MB bereits fail-closed ab
   (PROJ-75, „fully screened or rejected"). Der Zustand heißt `too_large` und ist bewusst von `failed`
   getrennt: „zu groß, β löst das per Chunking" ist eine andere Aussage als „kaputt". Die zweite,
   kleinere Grenze für die Übergabe an das Modell gehört zu α.2 und wird dort an den Kostendeckeln
   begründet.
3. **`entity_type`-CHECK** → in derselben Migration, per Anker-Ersetzung aus der Live-Definition, mit
   Treffer-Eindeutigkeitsprüfung **und** Post-Verifikation.

**Was bewusst NICHT getrackt wird.** `extracted_text` steht nicht in der Audit-Whitelist. Er ist
Maschinenausgabe und kann megabytegroß sein; ihn zu tracken hieße, jede Neu-Extraktion als riesigen
Feld-Diff in ein Protokoll zu schreiben, das seit PROJ-130-α **keinen Löschpfad** mehr hat.
`summary_markdown` dagegen wird getrackt — den bearbeiten Menschen, und genau das will die Spec
protokolliert sehen.

**Vier eigene Fehler, von der eigenen Durchsicht bzw. den Vorprüfungen gefangen:**

- `execute format($f$ … mehrere Anweisungen … $f$)` — auf einzelne `execute`-Aufrufe zerlegt, statt sich
  auf mehrfach-Anweisungs-`EXECUTE` zu verlassen.
- Beim Zerlegen rutschte `v_gate` **hinter** `begin` statt in die Deklaration — der `DO`-Block wäre nicht
  kompiliert.
- Eine tote Zeile berechnete Anker-Treffer über eine Längendivision, die für einen **variabel langen**
  Regex-Treffer schlicht falsch ist. Ersetzt durch `regexp_matches(..., 'g')` mit harter
  „genau ein Treffer"-Bedingung.
- **Der ernsteste:** `pg_get_constraintdef` rendert die Werte als `'documents'::text`. Mein erstes
  `replace()` hätte den Cast an das *letzte* eingefügte Element gehängt. Anker jetzt inklusive
  optionalem Cast, Treffer live gegengezählt (**genau 1**), bevor die Migration lief.

Dazu eine Konventionsabweichung korrigiert: die Migration setzte anfangs `begin;`/`commit;` selbst —
**1 von 211** Bestandsmigrationen tut das (nämlich nur diese). Entfernt.

**Live-Pentest `tests/sql/PROJ-80-document-extractions-pentest.sql` — 10/10 PASS gegen Prod, 0 Rückstände**
(über fünf Zählungen gegengeprüft, nicht angenommen):

| Vektor | Messwert | Aussage |
|---|---|---|
| A | `privacy_class=3` | Default ist fail-closed |
| B | `23514` | `extracted` ohne Klassifikation unmöglich |
| C / D | `1` / `0` | Mitglied sieht die Standard-Zeile, die `strict`-Zeile nicht |
| **E** | `0` | **Volltextsuche nach dem Inhalt der `strict`-Zeile fördert nichts zutage** |
| F | `42501` | kein Client-Schreibweg |
| G / H | `true` / `false` | Verlauf lesbar wo erlaubt, verborgen wo nicht |
| I | `2` | Lebenszyklus + Feld-Änderung protokolliert |
| J | `0` | Auflöser fail-closed bei unbekanntem Dokument |

E ist der tragende Vektor: er sucht im **Klartext**. Eine Policy, die nur die Zeilenliste filtert, den
Text aber über eine Suche durchreicht, fiele genau dort auf. Das Mitglied musste synthetisiert werden —
in Prod ist jedes Mandanten-Mitglied Admin, und für Admins schließt `can_access_classified` kurz; ein
Smoke unter Admin wäre falsch-grün gewesen.

**Struktur unabhängig nachgeprüft** (nicht der eigenen Schreib-Antwort geglaubt): 10 Policies (2 permissiv
+ 8 restriktiv), 6 Trigger, `entity_type`-CHECK trägt beide neuen Werte **und** `documents` weiterhin,
Geschwisterzweig `documents` in `_tracked_audit_columns` unverändert (`deleted_at,mime_unsupported_for_rag`),
`anon` ohne jedes Tabellenrecht.

**Advisors 0 ERROR.** Die vier Meldungen auf `_dms_document_ctx` sind wörtlich dieselbe Kategorie
(`authenticated_security_definer_function_executable`), die `_dms_node_ctx` aus PROJ-Y-115c bereits trägt —
dem Muster inhärent, weil die Policies die Funktion als `authenticated` aufrufen müssen.

**PROJ-134-Versionsdrift, benigne.** Prod registrierte `20260814075847`, die Repo-Datei heißt
`20260814100000_proj80_alpha1_document_extractions`. Der `name`-Parameter war korrekt gesetzt (= Dateiname),
die MCP vergibt die Version dennoch selbst. Nicht umbenannt, weil die Migration **durchgängig idempotent**
ist (`create table if not exists`, `create index if not exists`, `create or replace function`,
`drop trigger if exists`, Skip-Zweige in allen drei Register-Blöcken, idempotente Grants) und der
Dateiname die echte Reihenfolge gegenüber den Geschwistern abbildet — dieselbe Einordnung wie bei
PROJ-106/109/131/132. `check:migration-naming`: 0 Fehler.

### α.2 /backend — Extraktion, Klassifikation, Summarizer (2026-08-14)

In drei Schritten geliefert, weil ein Lauf zu groß war:

**α.2a — Extraktion + Volltext-Klassifikation.** Schließt die im Tech Design als sicherheitsrelevant
benannte Lücke: der DMS-Pfad trug keine Datenschutz-Klassifikation. Kein neues Verfahren, sondern die
Ausdehnung des PROJ-75-Musters (derselbe Parser, derselbe Klassifizierer über den **Volltext**, dieselbe
fail-closed-Haltung). Zweite Obergrenze entschieden: `SUMMARY_INPUT_MAX_CHARS = 48.000` (~12k Token),
getrennt von der 2-MB-Parsergrenze, weil sie einen anderen Zweck hat — konservativ, weil Class-3 nur an
Ollama darf und lokale Modelle häufig mit 8k-Kontext laufen. **Kein Datenschutz-Loch:** die Klassifikation
läuft vorher über den vollständigen Text. Nachweis: 4 **ungemockte** Fälle mit echten Dateien; der
tragende setzt die E-Mail-Adresse bei Zeichen ~20.000, also weit hinter der Auszugsgrenze.

**α.2b — Summarizer-Zweck über alle sechs Anbieter.** Lockstep-Migration `20260814140000`
(`ki_runs` **und** `tenant_ai_cost_caps`), Anker mit Treffer-Eindeutigkeit und Post-Verifikation je
Tabelle, plus eine **Verhaltensprobe statt Textprobe**. Ein geteilter Runner statt vier Kopien des
Modell-Aufrufs; Ollama mit lockerem Schema und Kappung danach (PROJ-88); der Stub liefert `null` statt
einer erfundenen Kurzfassung.

> **Strukturbefund, in α.2b behoben:** die Capability-Matrix war **nicht** datengetrieben, sondern eine
> Liste handgeschriebener Fälle — sie prüfte, woran sich jemand erinnert hatte, nicht die
> `AIPurpose`-Union. Genau das Loch, gegen das PROJ-85 antrat: als `document_summary` dazukam, blieb sie
> grün und bewies nichts. Jetzt über `AIPurpose` erschöpfend typisiert, **6 → 42 Fälle**. Der
> Rot-Grün-Beweis fiel von selbst an: der erste Lauf fand drei Fehlannahmen — `sentiment`, `coaching` und
> `proposal_stakeholders_from_context` sind nur bei Ollama+Stub, und das ist **richtig** (ihre
> Klassifizierer geben fest 3 zurück). Meine Tabelle war falsch, das Produkt nicht. Sie hält diese Absicht
> jetzt fest; der alte Test konnte „absichtlich nicht da" nicht von „vergessen" unterscheiden.

**α.2c — Verdrahtung.** Migration `20260814160000`: `ensure_summarizer_skill` (nachgesät je Mandant, nach
dem `seed_risk_categories_if_empty`-Muster) + Löschschutz-Trigger. Der Summarizer ist ein **gewöhnlicher**
PROJ-76-Skill und erbt dadurch Versionierung, Entwurf/Veröffentlichen (PROJ-77), Audit und die
Admin-Oberfläche, statt eine zweite Verwaltung aufzumachen. Sein Inhalt ist **Zusatzanweisung**, nicht der
ganze Prompt: die unverhandelbaren Regeln stehen im Code, sonst könnte eine Mandanten-Anpassung die
Zusicherung aushebeln, dass die Quintessenz das Dokument wiedergibt statt es auszuschmücken.

Die Kette liegt in **einer** Funktion (`runDocumentPipeline`), weil sich drei Aufrufer sie teilen: Upload,
Wiederholen und der nächtliche Lauf — und der nächtliche ist der Pfad, den niemand beobachtet. Die
Quintessenz startet **nur** bei `status='extracted'`; das ist keine Optimierung, sondern die Zusicherung,
dass ohne geprüften Volltext kein Text an ein Modell geht (5 Testfälle über alle anderen Zustände).

Der Aufräumlauf (`/api/cron/document-summaries`, 04:15 UTC) holt **nur** nach, was nachweislich fehlt.
Ein `failed`-Dokument bleibt `failed`: Wiederholen ist eine bewusste Nutzerhandlung, kein nächtliches
Wiederkäuen, das Kosten verursacht und immer am selben Fehler scheitert.

**Live-Smoke Skill 5/5 gegen Prod, 0 Rückstände** — inklusive der Gegenprobe, dass ein *gewöhnlicher*
Skill weiterhin löschbar ist (der Wächter sperrt nicht alles): Anlage mit aktiver Fassung ·
Idempotenz · Löschschutz `42501` · normaler Skill löschbar · fremder Mandant `P0003`.

**Gates α.2c:** vitest 3041/3041 (384 Dateien) · tsc 13 = Baseline · ESLint 0 · Build clean (Cron-Route
registriert) · migration-naming 0 Fehler.

### α /frontend — Detailansicht + Routen (2026-08-14, abgeschlossen 2026-08-18)

3 Routen (`GET`/`PATCH …/summary`, `POST …/summary/retry`), Client-Wrapper, und der Reiter
**Quintessenz** neben **Vorschau** am ausgewählten Dokument. Der erste Lauf endete durch einen
Umgebungsabbruch mitten in der Arbeit; der zweite hat den Zwischenstand **nicht** als fertig übernommen,
sondern gegen die Gates und gegen die Datenbank nachgeprüft — und dabei vier Dinge gefunden, die unten
einzeln stehen.

**Der Kern der Fläche ist das Unterscheiden, nicht das Anzeigen.** „läuft noch", „keine Textebene",
„zu groß", „kein zulässiger Anbieter" und „ist da" sind fünf Zustände mit fünf verschiedenen nächsten
Schritten. Ein gemeinsames „keine Quintessenz vorhanden" wäre bequem und falsch — und würde einen
Vertraulichkeits-Block wie ein Produktversagen aussehen lassen. Deshalb liefert `GET` Quintessenz **und**
Auszugs-Zustand, und die Oberfläche übersetzt beide (inkl. der PROJ-137-`reason_code`s).

#### Der Autorisierungs-Fix (`src/lib/dms/document-scope.ts`) — sicherheitsrelevant

Der `PATCH` prüfte das Bearbeitungsrecht gegen das Projekt aus dem **Pfad**, holte die zu ändernde Zeile
danach aber allein über `document_id`. Beides zusammen ist die Lücke: die Lese-Policy
`document_summaries_select` verlangt nur `is_project_member` des **eigenen** Projekts des Dokuments, und
geschrieben wird mit service-role. Ein Nutzer mit Bearbeitungsrecht in Projekt A konnte damit die
Quintessenz eines Dokuments aus Projekt B ändern, in dem er bloß Betrachter ist — **das Recht wurde am
falschen Projekt geprüft**. Die Projekt-Kennung im Pfad war für den Schreibvorgang Dekoration.

Warum der Fix trägt, in dieser Reihenfolge:

1. **Er sitzt vor dem Schreibvorgang, nicht daneben.** `resolveDocumentInProject` löst das Projekt über
   `documents.tree_node_id → document_tree_nodes.project_id` auf und gibt `null`, sobald das nicht das
   Projekt aus dem Pfad ist. Erst danach wird überhaupt eine Zeile geholt.
2. **Er liest mit der Nutzersitzung, nicht mit service-role.** Die Auflösung ist damit gleichzeitig die
   Sichtbarkeitsprüfung — mit service-role wäre sie wirkungslos („a report RPC called with the
   service-role key bypasses every RLS gate above it", CLAUDE.md).
3. **Er ist EINE Autorität für alle drei Routen.** Vorher stand die Prüfung zweimal kopiert (`GET`,
   `retry`) und fehlte genau dort, wo geschrieben wird. Drei Kopien einer Berechtigungsregel sind die
   Krankheit, nicht das Symptom (PROJ-130: vier Register, die auseinanderliefen).
4. **Er verrät nichts.** Unsichtbar, nicht existent und fremd liefern alle `null` → 404. Jede
   Unterscheidung wäre eine Aussage über fremden Bestand.
5. **Er nimmt die Stufe vom Knoten, nicht vom Dokument.** Damit bleibt die Kette aus PROJ-Y-115c
   unverändert die einzige Quelle (Dokumente erben über den Baumknoten); eine zweite Stufenspalte wäre
   die Wahrheit, die auseinanderläuft.

**Nicht behauptet, sondern rot-grün belegt:** wird der Zweig entfernt, fällt genau
`404 wenn das Dokument zu einem anderen Projekt gehört — auch mit Bearbeitungsrecht hier`, und der Test
prüft zusätzlich, dass **gar nicht geschrieben** wurde (`admin.update` nicht gerufen) — ein 404 allein
würde nicht ausschließen, dass vorher schon etwas passiert ist.

#### Optimistische Sperre: serverseitig erzwungen, nicht beratend

`If-Match` ist **Pflicht** (fehlt der Kopf → `428`, PROJ-141-α2-Lehre), ein veralteter Wert → `409`.
Entscheidend ist die zweite Hälfte: die Bedingung steht **im `UPDATE` selbst** (`.eq("updated_at", ifMatch)`),
und trifft es 0 Zeilen, antwortet die Route `409` statt Erfolg. Zwischen Vorprüfung und Schreibvorgang
liegt sonst ein Moment, in dem ein zweiter Bearbeiter zuschlägt — dann wäre die Prüfung Zierde und der
Spec-Edge-Case „zwei PMs bearbeiten gleichzeitig" nicht abgedeckt. Der Trigger
`document_summaries_set_updated_at` ist `before update`, die `where`-Bedingung sieht also den Wert **vor**
dem Schreiben; das ist der Grund, dass der Vergleich überhaupt funktioniert. Rot-grün belegt: ohne das
`.eq(...)` fällt `trägt die If-Match-Bedingung IM Update`.

#### Vier Funde des zweiten Laufs

- **F-1 (4 neue `tsc`-Fehler, behoben).** Der Zwischenstand nahm einen echten `SupabaseClient` gegen ein
  nachgebautes `from().select().eq().maybeSingle()`-Interface — nicht zuweisbar, weil Supabases Builder ein
  *thenable* ist (`then`, aber kein `catch`/`finally`) und seine Ketten generisch überladen sind: `TS2345`
  ×3 plus `TS2589` („type instantiation is excessively deep"). Wörtlich PROJ-144-F-9. Auch der zweite
  Anlauf (`PromiseLike` in derselben Interface-Form, dann eine Fabrik) blieb an `TS2589` hängen; getragen
  hat erst das **Callback** — dieselbe Auflösung, die PROJ-130-δ1 für `RpcInvoker` gewählt hat, weil dabei
  nichts verglichen, sondern der Parameter *abgeleitet* wird. Baseline wieder **13, 0 neu**.
- **F-2 (Deckungsverlust durch genau diesen Fix, ersetzt).** Der Schema-Drift-Wächter löst ausschließlich
  **String-Literale** in einer `.from("…").select("…")`-Kette auf (`ast-walker.ts:44-49`). Mit dem Callback
  stehen Tabelle und Spalten in Variablen — zwei Abfragen wurden für den Wächter unsichtbar, und die zwei
  Selects der Detailroute waren als Konstanten ohnehin nie sichtbar. Nicht verschwiegen, sondern ersetzt:
  `DOCUMENT_SCOPE_COLUMNS` + `summary-select.ts` machen die Spalten zu Daten, und ein Test prüft **alle
  vier Tabellen** gegen die Migrationsdateien. Das läuft ohne Docker (offener Handoff PROJ-67/F6) und ist
  für diese Abfragen damit belastbarer als der Wächter. Rot-grün: eine erfundene Spalte macht ihn rot.
- **F-3 (Schutz der Handänderung war Zufall, jetzt Zusicherung).** Die Spec verlangt zweimal, dass eine
  von Hand geänderte Fassung nicht automatisch verloren geht. Das hielt auch vorher — aber nur aus dem
  Zusammenspiel dreier Aufrufer (Upload legt stets ein *neues* Dokument an, der nächtliche Lauf
  überspringt jede vorhandene Zeile, nur der Knopf trifft eine bestehende). Ein vierter Aufrufer — β mit
  Überschreiben beim erneuten Hochladen — hätte den Handtext stillschweigend vernichtet.
  `runDocumentSummary` hat jetzt `force` (Standard `false`), bricht **vor** dem Modellaufruf ab (spart auch
  den Kostenaufruf) und meldet `status: "user_edited"` mit Grund `user_edited_preserved`; nur die
  Wiederholen-Route setzt `force: true`. Dazu wird beim Neuerzeugen der Bearbeiter-Stempel geleert — eine
  Zeile, die „automatisch erzeugt" sagt und gleichzeitig einen Bearbeiter trägt, ist falsch; die Historie
  steht im Feld-Audit (`status`, `summary_markdown` sind getrackt).
- **F-4 (destruktiver Knopf ohne Rückfrage, behoben).** „Neu erzeugen" über eine Handänderung ist der
  einzige Weg im Produkt, der eine menschlich verantwortete Quintessenz vernichtet, und die Spec erlaubt
  das ausdrücklich nur als Ausnahme („unless admin force-re-runs"). Ein Klick ohne Rückfrage wäre die
  Ausnahme als Regel → `AlertDialog` (shadcn, im Bestand) **nur** bei `status === "user_edited"`.

**Zwei Gates haben dabei eigene Fehler gefangen, nicht der Autor:** `react-hooks/static-components` lehnte
die im Render definierte Dialog-Komponente ab (sie hätte bei jedem Durchlauf ihren Zustand verloren — beim
Bestätigungsdialog heißt das: er schließt sich unter der Hand), und `react-hooks/set-state-in-effect`
lehnte den geteilten `load()`-Weg ab, der vor dem `await` `setLoading(true)` setzte. Beides auf das
Haus-Muster `use-tenant-members` umgestellt (Anfangszustand `loading = true`, Zustand nur **nach** dem
`await`, Neuladen über einen Zähler in der Abhängigkeitsliste). Der `cancelled`-Wächter ist hier keine
Zierde: der Nutzer klickt im Baum weiter, während die Antwort läuft — ohne ihn schreibt die alte Anfrage
die Quintessenz des vorigen Dokuments in die neue Ansicht.

#### Belege je Akzeptanzkriterium (α-Anteil)

| Kriterium (Spec-Block) | Zustand | Beleg |
|---|---|---|
| Detailseite: Reiter Vorschau / Quintessenz | erfüllt (2 von 3 Reitern) | `dms-page.tsx` shadcn-`Tabs`; Reiter „Verlinkungen" **nicht** gebaut → PROJ-Y-80a |
| Quintessenz-Reiter zeigt Markdown, inline bearbeitbar | erfüllt | `document-summary-panel.tsx`; `PATCH`-Route; Routentest „speichert, hebt auf `user_edited` und stempelt den Bearbeiter" |
| Speichern hebt Status auf `user_edited` | erfüllt | Routentest (Statuswechsel + `edited_by_user_id`) |
| … und stoppt weitere automatische Erzeugung | erfüllt, **jetzt erzwungen** | `summary-runner.test.ts`: „überschreibt … NICHT und ruft kein Modell" (F-3) |
| „unless admin force-re-runs" | erfüllt, mit Abweichung D-α.3 | `force: true` nur aus der Wiederholen-Route + Bestätigungsdialog; Recht ist `edit`, nicht `admin` |
| Fehlschlag → Zeile `stale` + „Quintessenz nicht erzeugt" + Wiederholen-Knopf | erfüllt | Panel-Zustand 3; `explainReason` übersetzt alle fünf `reason_code`s; `summary-runner.test.ts` bucht leeres Ergebnis als `stale` **mit** Grund |
| „Summarizer Skill nicht aktiv" → Erzeugung läuft trotzdem | erfüllt | Retry-Routentest „erzeugt trotzdem, wenn das Nachsäen scheitert" |
| Extraktion fehlgeschlagen → im DMS sichtbar, kein Weiterlauf | erfüllt | `explainExtraction` unterscheidet `pending`/`too_large`/`unsupported_type`/`failed`+`no_text_layer`; Retry-Route `409` für alle Nicht-`extracted`-Zustände, und der Test prüft, dass der Erzeuger **gar nicht** gerufen wird |
| Optimistische Sperre via `If-Match`, einer bekommt 409 | erfüllt, serverseitig | 428 / 409 / 409-bei-0-Zeilen; rot-grün belegt |
| Lesen folgt Dokument-RLS; Bearbeiten braucht Lead/Editor | erfüllt | `requireProjectAccess(…, "view"\|"edit")` + `resolveDocumentInProject`; Routentest pinnt die Rolle je Route |
| Audit-Hook (PROJ-10) | erfüllt, mit Abweichung D-α.4 | Feld-Audit auf `status`/`summary_markdown`/`structured_summary` + Lebenszyklus (α.1); **keine** benannten Ereignisse `document.summary_edited` etc. |
| Zugriffsprotokoll für vertrauliche Inhalte | erfüllt | `logConfidentialAccess`; Routentests belegen Eintrag bei `strict`, **kein** Eintrag bei `standard`, und Auslieferungs-Stopp bei fehlgeschlagenem Pflichteintrag — inkl. Prüfung, dass der Inhalt dabei nicht doch durchsickert |
| Umschalter „Vollständig / Quintessenz" am verknüpften Dokument | **offen, nicht baubar** | keine Aufgabe↔Dokument-Verknüpfung im Produkt → PROJ-Y-80b |
| Echter Ende-zu-Ende-Lauf mit Anbieter | **offenes Kriterium** | siehe unten |

#### Offenes Kriterium (ausdrücklich keine Abweichung)

Ein **echter Ende-zu-Ende-Lauf mit erreichbarem Anbieter** — ein Dokument, das durch ein reales Modell zu
einer Quintessenz wird — ist **nicht** bewiesen. Bewiesen ist die Mechanik: Extraktion ungemockt,
Volltext-Klassifikation, Kette, Skill-Nachsaat, Lockstep-Regeln, alle drei Tore, Sperre, Protokoll. Nicht
bewiesen ist die Verkettung mit einem Modell — wie bei PROJ-88/89 abhängig von einem erreichbaren Ollama
bzw. einem Cloud-Schlüssel. Das ist ein **offenes Akzeptanzkriterium**, keine Abweichung (PROJ-135-Lehre:
eine nicht ausgeführte Prüfebene ist kein Zugeständnis, sondern eine offene Zusage). Ebenso nicht bewiesen
ist ein **angemeldeter Browser-Durchlauf** über die Fläche; die DMS-Fläche ist zwar nicht modul-gegatet,
das DMS in Produktion aber leer, und ein Dokument mit Auszug und Quintessenz gibt es in keiner Fixture.
Beides gehört zu `/qa`.

#### Abweichungen

- **D-α.1 — Reiter „Verlinkungen" nicht gebaut.** Live geprüft: auf `documents` verweist außer Auszug und
  Quintessenz **kein einziges** Domänen-Objekt (Deliverables und Arbeitspakete hängen an eigenen
  Dokument-Tabellen mit anderem Modell). Ein Reiter, der nur „nichts" zeigen kann, ist ein Versprechen
  ohne Deckung. → PROJ-Y-80a, gebunden an PROJ-79s eigenen Vorbehalt `PROJ-Y-doc-refs`.
- **D-α.2 — Umschalter „Vollständig / Quintessenz" nicht gebaut.** Das Tech Design wollte ihn „dort
  zeigen, wo bereits Verknüpfungen bestehen"; es bestehen keine. → PROJ-Y-80b.
- **D-α.3 — Recht zum Neuerzeugen ist `edit`, nicht `admin`.** Die Akzeptanzkriterien sagen „admin
  force-re-runs", die Technical Requirements derselben Spec sagen „edit requires project_lead or editor
  role". Gefolgt wurde den Technical Requirements (sonst könnte der Bearbeiter speichern, aber nicht
  korrigieren); die Zerstörungsgefahr ist stattdessen durch den Bestätigungsdialog abgedeckt.
- **D-α.4 — kein benanntes Ereignis-Vokabular.** Die Spec listet `document.indexed`,
  `document.summary_edited` usw.; das Produkt hat keinen Ereignis-Bus, sondern Feld- und
  Lebenszyklus-Audit (PROJ-10/PROJ-130). Die *Sache* — nachvollziehbar, wer wann was geändert hat — ist
  erfüllt, die Form nicht. Ein Parallel-Vokabular wäre ein zweites Register (PROJ-130).
- **D-α.5 — Mobile Safari übersprungen** (WebKit-Host-Bibliotheken, PROJ-67/F2).

#### Gates (zweiter Lauf, 2026-08-18)

ESLint **0 Fehler** · `tsc` **13 = Baseline, 0 neu** (auf `origin/main` gegengemessen) ·
vitest **3093/3093** (388 Dateien; +47 gegenüber dem Zwischenstand) · Build **clean, 13,2 s**, beide
Routen registriert · `check:migration-naming` **0 Fehler** (217 Migrationen, 89 vorbestehende Warnungen) ·
`check:index-scope` **0 Fehler** · Playwright `tests/PROJ-80-document-summary.spec.ts` **4/4** chromium.

Die Playwright-Zusicherungen wurden dabei **verschärft**: sie akzeptierten vorher `[307, 401, 404]` und
hätten damit auch bestanden, wenn die Routen gar nicht mehr existierten — ein Tortest, der das Fehlen der
Tür für ein verschlossenes Tor nimmt. Jetzt genau `307`. Der Rumpf wird zusätzlich **positiv** geprüft;
dabei fiel die erste Erwartung (`Redirecting…`) durch und wurde durch den gemessenen Wert ersetzt: diese
API-Routen liefern das Umleitungsziel `/login?next=…`.

**Offen für α (historisch, erledigt):** Routen Anzeigen/Bearbeiten/Wiederholen und die Dokument-Detailfläche.

## QA Test Results
_To be added by /qa._

## Deployment
_To be added by /deploy._
