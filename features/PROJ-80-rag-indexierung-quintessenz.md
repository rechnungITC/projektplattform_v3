# PROJ-80: RAG-Indexierung + Quintessenz

## Status: Deployed (α — Quintessenz ohne Vektor; β Retrieval offen)
## Deployment Scope: alpha
> Gebucht am 2026-09-01. **`alpha`**, weil β (Retrieval) ein *benannter* offener Sub-Slice ist und vier
> ursprüngliche Kriterien mit Ziel-Kennung zurückgestellt sind — die Ableitung Wert für Wert steht im
> Abschnitt [Deployment](#deployment). Die frühere Notiz „Scope bleibt leer, bis `/deploy` läuft“ ist
> damit eingelöst. **Berichtigt 2026-08-24:** dieser Block nannte weiterhin *zwei* offene Kriterien,
> während die Statuszeile schon *eines* sagt — der angemeldete Browser-Durchlauf ist mit #440
> erledigt, offen ist allein der echte Anbieter-Lauf (**PROJ-Y-80d**).

**Created:** 2026-06-06
**Last Updated:** 2026-09-01

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
| Echter Ende-zu-Ende-Lauf mit Anbieter | **offenes Kriterium** | siehe unten; in `/qa` 2026-08-21 bestätigt offen — Anbieter nur im Kundenmandanten, Nutzer stellt Endpunkt → PROJ-Y-80d |
| Angemeldeter Browser-Durchlauf über die Fläche | **erfüllt in `/qa`** | `PROJ-80-alpha-qa-chain.spec.ts`: Baum → Dokument → Reiter Quintessenz → Handänderung, in Oberfläche **und** Datenbank geprüft (3× grün) |
| Autorisierungs-Fix greift wirklich (#399) | **erfüllt in `/qa`** | HTTP-Kette mit echter Sitzung + 3 Gegenproben; rot-grün: ohne Auflöser antwortet der Angriff **200** und schreibt |
| Zugriffsprotokoll live (δ2), nicht nur gemockt | **erfüllt in `/qa`** | `strict` erzeugt genau 1 Eintrag, `standard` keinen; rot-grün belegt |

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

> **Nachtrag `/qa` 2026-08-21:** die zweite Hälfte ist eingelöst — der Browser-Durchlauf läuft gegen ein
> in `/qa` geseedetes Dokument (`PROJ-80-alpha-qa-chain.spec.ts`). Die erste Hälfte (Modell-Aufruf) bleibt
> offen und ist als **PROJ-Y-80d** registriert; der Nutzer stellt dafür einen Endpunkt bereit, weil
> Anbieter live ausschließlich im Kundenmandanten existieren.

#### Nachtrag 2026-08-24 — zweite, parallel gelaufene QA (#441)

Die α-QA lief in **zwei Sitzungen gleichzeitig**. Das ist zuerst ein Befund über die
Arbeitsteilung, nicht über das Produkt: zwei Läufe haben dieselbe Slice abgenommen,
ohne voneinander zu wissen. Festgehalten wird hier, was der zweite Lauf **zusätzlich**
belegt — und ausdrücklich auch, was er *nicht* zusätzlich belegt.

**Deckungsgleich (also kein Zugewinn):** der zweite Lauf hatte auf Datenbankebene
Schreib-Grants, direktes `INSERT`/`UPDATE`/`DELETE` als Projekt-Editor, `strict`
verborgen **samt Klartextsuche**, fremden Mandanten und `anon`-Rechte geprüft. Genau
diese Vektoren stehen unabhängig auch in `PROJ-80-alpha-qa-redteam-pentest.sql`
(`W_schreib_grants`, `K`/`M`/`N`, `T`/`U`, `O`, `Q`) — zwei Wege, dasselbe Ergebnis.
Der Browser-Durchlauf (Reiter, Handänderung, DB-Gegenprobe) ebenso.

**Echt zusätzlich, zwei Dinge:**

1. **Der Bestätigungsdialog vor dem Überschreiben einer Handänderung** —
   `tests/PROJ-80-alpha-regenerate-confirm.spec.ts` (1 Fall, chromium; im Verbund mit
   den beiden anderen PROJ-80-Specs **14/14**). Die neun Fälle aus #440 prüfen ihn
   nicht, und er sichert den **destruktivsten** Weg im Produkt: „Neu erzeugen" über
   einer von Hand verantworteten Fassung, von der Spec nur als Ausnahme erlaubt
   („unless admin force-re-runs", F-4 des zweiten `/frontend`-Laufs). Geprüft wird,
   dass der Dialog auf der echten Seite **erscheint** und dass „Abbrechen" Text *und*
   `status='user_edited'` unberührt lässt — ein Komponententest beweist nur, dass die
   Komponente ihn kennt.
2. **Regression der Vertraulichkeitskette, auf der α aufsetzt** — der Verifikationsteil
   von `PROJ-Y-115c-document-confidentiality-pentest.sql`, **5/5** live gegen Prod:
   Wächter-Funktionen für `authenticated` nicht aufrufbar, die zwei Policy-Auflöser
   sehr wohl (sonst wären die Regeln wirkungslos), Vererbung beim Einfügen greift,
   Herabstufen `23514`, Anheben kaskadiert in den Teilbaum. Der Auszugs- und
   Quintessenz-Zugriff erbt seine Stufe über genau diese Kette; bräche sie, ginge das
   Tor lautlos auf. Im Rot-Team-Pentest von #440 kommt sie nicht vor.

**Beobachtung ohne Schweregrad, mit Zahlen:** Feld-Audit-Zeilen aus Testläufen sind
dauerhaft. Nach beiden Läufen hatte `document_summaries` **0** Zeilen, es gab aber
**60** Audit-Zeilen dazu — **4** aus dem zweiten Lauf, 56 aus dem ersten und weiteren
Läufen desselben Tages, plus 18 zu `document_tree_nodes`. Ursache ist das registrierte
**PROJ-Y-45e**: `tenants.audit_lifecycle_exempt` unterdrückt Anlage und Löschung, den
Feld-Audit **nicht**. Kein Fehler dieser Slice — aber die Fläche ist E2E-testbar und
dabei **nicht** rückstandsfrei, und das gehört gesagt, weil es mit jedem Lauf wächst.

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

### `/qa` PASS 2026-08-21 — 0 Critical / 0 High / 0 Medium / 0 Low → **Approved**

Die α-Slice war bis hierher gebaut, aber nie als Ganzes abgenommen. `/frontend`
hatte zwei Zusagen ausdrücklich offen gelassen; **eine ist jetzt eingelöst**, die
andere bleibt ein benanntes offenes Kriterium (unten).

Wichtiger als das Nachmessen der Belege war der **Sicherheits-Fix aus #399**. Er
ist Anwendungscode (`resolveDocumentInProject`), und ein Anwendungs-Guard ist nur
so viel wert wie die Aussage, dass die Datenbank ihn nicht ohnehin überflüssig
macht. Genau das war offen.

#### 1. Der Autorisierungs-Fix — Voraussetzung und Wirkung getrennt bewiesen

**Die Voraussetzung** (Live-Pentest, Teil 1, Vektoren K und L als Paar): die
Quintessenz-Zeile **ist** für jedes Projektmitglied lesbar (`L = 1`), es gibt aber
**keinen** Client-Schreibweg (`K/M/N = 42501`) — geschrieben wird also mit
service-role. Zwischen „Bearbeitungsrecht in Projekt A" und „Quintessenz eines
Dokuments aus Projekt B" steht damit nachweislich **nichts** außer dem Auflöser.

**Die Wirkung** (`tests/PROJ-80-alpha-qa-chain.spec.ts`, echte Sitzung über HTTP):

| Fall | Erwartung | Ergebnis |
|---|---|---|
| Angriff: `PATCH /projects/A/documents/{docB}` | 404, Zeile unverändert | **404**, `status` weiter `auto`, `edited_by_user_id` null |
| Angriff: `GET /projects/A/documents/{docB}` | 404, kein Inhalt im Rumpf | **404** |
| Angriff: `POST …/{docB}/summary/retry` über Projekt A | 404, `updated_at` unverändert | **404** |
| Gegenprobe Sichtbarkeit: `GET /projects/B/documents/{docB}` | 200 mit Inhalt | **200** |
| Gegenprobe Recht: `PATCH /projects/A/documents/{docA}` | 200 → `user_edited` | **200**, Bearbeiter gestempelt |
| Rollenregel: `PATCH /projects/B/documents/{docB}` | 403 (nur Betrachter) | **403** |
| Sperre: ohne `If-Match` / veraltet | 428 / 409 | **428 / 409** |

Die drei Gegenproben sind der Kern. Der Angriff allein belegt nichts — ein 404
könnte auch von einer kaputten Sitzung kommen. Erst *Angriff + Recht* sagt „der
**Pfad** war das Problem, nicht die Sitzung", und erst *Angriff + Sichtbarkeit*
sagt „die RLS hat die Zeile **nicht** verborgen; gestoppt hat allein der
Auflöser". Die Rollenregel trennt zusätzlich `403` (Bereich richtig, Rolle zu
schwach) von `404` (Bereich falsch) — ohne sie bliebe unklar, woran der Angriff
scheitert.

**Rot-Grün, und das Ergebnis ist der eigentliche Befund:** mit entferntem
Auflöser im `PATCH` antwortet derselbe Angriff **HTTP 200**. Der Schreibvorgang
gelingt also wirklich — ein Projekt-`viewer` in B überschreibt B's Quintessenz
über Projekt A. (Die Route gibt 200 ausschließlich, wenn das `UPDATE` eine Zeile
zurückgab; andernfalls 409. Das 200 belegt damit den Schreibvorgang, nicht nur
den Statuscode.) Der Fix ist tragend, nicht dekorativ. Danach zurückgesetzt —
über eine Dateikopie, nicht `git checkout` (PROJ-130-δ2/F-3) — und wieder grün.

**Warum der Bau-Betrachter der einzig mögliche Akteur ist:**
`isProjectEditAllowed` gibt für `tenantRole === "admin"` in **jedem** Projekt des
Mandanten `true` zurück (live am Code gelesen). Mit dem geteilten E2E-Nutzer ist
„Betrachter in Projekt B" also gar nicht darstellbar und der Angriff würde
legitim mit 200 enden. `E2E_CONSTRUCTION_VIEWER_USER_ID` ist Mandanten-`member`
und Projekt-`viewer` — von PROJ-45-β genau aus diesem Grund so angelegt. Er
bringt seine Sitzung mit: keine fünfte Fixture-Spur, kein weiterer
Anmeldevorgang.

#### 2. Die Fläche im angemeldeten Browser (schließt die erste `/frontend`-Zusage)

Dokument mit Auszug und Quintessenz geseedet, dann durchfahren: Baum → Dokument
wählen → Reiter „Quintessenz" → Kurzfassung sichtbar, Abzeichen „Automatisch
erzeugt" → „Bearbeiten" → speichern → Abzeichen „Von Hand geändert". Beide
Hälften geprüft: die Oberfläche sagt es **und** die Datenbank bestätigt es
(`summary_markdown`, `status='user_edited'`, `edited_by_user_id`). Ohne die zweite
Hälfte wäre nur belegt, dass ein Abzeichen seinen Text wechselt.

#### 3. Zugriffsprotokoll für vertrauliche Inhalte (δ2), erstmals live

Die Routentests belegen das gemockt; hier läuft es gegen die echte RPC. Das
**Paar** ist die Zusicherung: bei `strict` entsteht genau **ein** Eintrag, bei
`standard` **keiner**. Nur die erste Hälfte wäre auch mit „protokolliert immer
alles" grün — eine andere und teurere Zusage.

#### Live-Nachweise gegen Prod (alle zurückgerollt)

| Datei / Lauf | Ergebnis |
|---|---|
| `PROJ-80-document-extractions-pentest.sql` (α.1, **wörtlich**) | **10/10 PASS** |
| `PROJ-80-alpha-qa-redteam-pentest.sql` Teil 1 (neu) | **13/13 PASS** |
| `PROJ-80-alpha-qa-redteam-pentest.sql` Teil 2 (neu, Summarizer-Skill) | **9/9 PASS** |
| `PROJ-Y-115c-document-confidentiality-pentest.sql` Teil 1 (Regression, **wörtlich**) | **A–Q 17/17 PASS** |
| Playwright `PROJ-80-alpha-qa-chain.spec.ts` + `PROJ-80-document-summary.spec.ts` | **3× 13/13** chromium |

Die 115c-Regression ist nicht Zierde: α.1 hat `entity_type`-CHECK,
`_tracked_audit_columns` und `can_read_audit_entry` per Anker-Ersetzung gepatcht,
und deren Vektor Q prüft genau den `document_tree_nodes`-Zweig des Lesetors.

Teil 2 belegt die Skill-Kriterien (nachgesät · aktive Fassung · `cross_cutting` ·
idempotent · **nicht löschbar `42501`**) mit `F` als Falsch-Grün-Sicherung: ein
*gewöhnlicher* Skill bleibt löschbar, der Wächter sperrt also nicht alles.

#### Zwei eigene Prüf-Fehler, gefunden und behoben

- **Der wichtigere:** die erste Fassung der Protokoll-Prüfung war **grün, obwohl
  der Protokoll-Aufruf aus der Route entfernt war** — sie fragte „existiert ein
  `strict`-Eintrag?", und das Protokoll ist seit δ1 append-only, also war die
  Antwort durch die Geschichte früherer Läufe erfüllt. Zusätzlich war die
  Vorfassung mit einer `+1`-Erwartung ab dem zweiten Lauf rot, weil δ2
  **entprellt** — Schlüssel `(actor, project, entity_type, action, max_level)` in
  15 Minuten, `entity_id` gehört **nicht** dazu (an der Live-Definition gemessen,
  nicht vermutet). Das Produkt war beide Male richtig, die Erwartung falsch.
  Gelöst über ein **je Lauf frisches Projekt**: keine Vorgeschichte möglich,
  Entprellungs-Schlüssel garantiert neu, Erwartung exakt (0 dann genau 1) — und
  rot-grün belegt.
- Zwei Fixture-/Locator-Fehler: das Dokument war zunächst als `node_type:
  "folder"` geseedet (der Baum rendert `document_tree_nodes`, ein Ordner bekommt
  korrekt keine Reiter), und „Automatisch erzeugt" traf ohne `exact` auch den
  Fixture-Text. Beides meine Fehler, nicht die des Produkts.

#### Gates

ESLint **0** · `tsc` **13 = Baseline / 0 neu** — gegen einen **frischen
`origin/main`-Worktree** gegengemessen (13 = 13); ein Zwischenlauf meldete
irreführend **3**, das ist die `.next`-Messfalle aus PROJ-Y-143e/PROJ-45-β, nach
`rm -rf .next` sind beide Seiten 13 · vitest **3562/3562** (423 Dateien) · Build
**clean**, beide Routen registriert · `check:migration-naming` 0 Fehler ·
`check:index-scope` 0 Fehler · Supabase-Advisors **149 WARN / 0 ERROR**.

Die zwei PROJ-80-Advisor-Meldungen (`_dms_document_ctx`,
`ensure_summarizer_skill`) sind nachgeprüft **dieselbe** Kategorie
(`authenticated_security_definer_function_executable`), die `_dms_node_ctx` seit
PROJ-Y-115c trägt und die 146× im Bestand vorkommt — dem Muster inhärent, weil
die Policies die Funktion als `authenticated` aufrufen müssen.

#### Offenes Kriterium (unverändert, ausdrücklich keine Abweichung)

Der **echte Ende-zu-Ende-Lauf mit erreichbarem Anbieter** ist weiterhin nicht
bewiesen. Live gemessen, warum: das DMS in Prod ist leer (0 Dokumente), es gibt
kein lokales Ollama, keine Schlüssel in `.env.local`, und Anbieter hat
ausschließlich der **Kundenmandant** (`ollama` + `openai`, beide `valid`). Der
Nutzer hat entschieden, einen eigenen Endpunkt bzw. Wegwerf-Schlüssel
bereitzustellen; damit wird die Kette in einem eigenen `[E2E]`-Mandanten
gefahren. Bis dahin bleibt es ein **offenes Akzeptanzkriterium**, keine
Abweichung (PROJ-135-Lehre) → **PROJ-Y-80d**.

Bewiesen ist alles davor: ungemockte Extraktion, Volltext-Klassifikation, die
Kette in `runDocumentPipeline`, die Skill-Nachsaat, die Lockstep-Regeln, alle drei
Tore, die Sperre und das Protokoll.

#### Befunde

- **F-1 (Info, vorbestehend, repo-weit — NICHT PROJ-80):** `authenticated` **und**
  `anon` halten `TRUNCATE` auf **151 von 152** Tabellen des `public`-Schemas
  (Supabase-Standardvergabe). `TRUNCATE` umgeht RLS vollständig. Über die
  Produktfläche nicht erreichbar — PostgREST hat kein `TRUNCATE`-Verb, es braucht
  direkten SQL-Zugang, der ohnehin privilegiert ist; `audit_log_entries` trägt
  seit PROJ-130-α einen eigenen `no_truncate`-Wächter, das Projekt kennt die
  Klasse also. **PROJ-80s Tabellen sind dabei strenger als der Bestand**: kein
  einziger Schreib-Grant (Vektor `W = 0`), während 150 Tabellen `INSERT` tragen.
  Nichts verfolgt das heute → **PROJ-Y-80e**.
- **F-2 (Info, vorbestehend, PROJ-107 — NICHT PROJ-80):**
  `seed_risk_categories_if_empty` ist `anon`-ausführbar (einziger
  `anon_security_definer`-Advisor). Live geprüft **nicht ausnutzbar** (`anon` →
  `42501`), aber eine Abweichung von der Hausnorm „revoke EXECUTE from `anon` on
  everything". PROJ-80s `ensure_summarizer_skill` folgt demselben Muster und ist
  dort **korrekt entzogen** → **PROJ-Y-80f**.
- **F-3 (Info, gemessene Einordnung, kein Fund):** das Tor von
  `ensure_summarizer_skill` ist die **Mitgliedschaft**, nicht Admin (Nicht-Mitglied
  → `P0003`). Das ist richtig: die Kette startet am Upload, den jeder Bearbeiter
  auslösen darf — ein Admin-Tor würde die Quintessenz eines Nicht-Admin-Uploads
  verhindern. Live gegengeprüft ist es zudem das Hausmuster:
  `seed_risk_categories_if_empty` (PROJ-107) und
  `ensure_default_ma_project_templates` (PROJ-96) sind **beide** ebenso
  mitgliedschafts-gegatet.

- **F-4 (Info, vorbestehend, PROJ-Y-114a/148e — NICHT PROJ-80):** der CI-Wächter
  „Verify prod function inventory vs migration files" schlägt am QA-PR fehl,
  obwohl dieser **keine** Migration enthält. Nachgemessen statt zugeordnet: grün
  auf `7feb4c92`, rot auf `d59b08b0` (dem PROJ-Y-114a-Merge) und allen
  `main`-Läufen danach — also **seit und wegen** PROJ-Y-114a. Der Wächter tut
  genau das, wofür PROJ-Y-148e ihn gebaut hat: dessen `pending_merge`-Ausnahme
  `_dd_finding_source_question_guard` wurde mit dem Merge überflüssig, und die
  Liste räumt sich selbst auf. Nicht hier mitbehoben, weil die Zusage dieses PRs
  „kein `src/`-Diff" ist und fremde Slice-Buchführung ihn schwerer prüfbar
  machte; der Check ist nicht enrolled, blockiert also keinen Merge →
  **PROJ-Y-114d**.

#### Rückstände — offengelegt statt gerundet

Alle Datenzeilen sind entfernt: `document_summaries`, `document_extractions`,
`documents`, `document_tree_nodes`, `[E2E 80]`-Projekte und -Mitgliedschaften je
**0**; Mandanten wieder **6**.

**Nicht entfernt: 16 Feld-Audit-Zeilen** (`document_summaries`, Paare aus
`status` + `summary_markdown`) aus den erfolgreichen Handänderungen der
Testläufe, sämtlich in `[E2E]`-Mandanten mit synthetischem Inhalt. Sie sind seit
PROJ-130-α **append-only ohne Löschpfad**. Bemerkenswert dabei: **keine einzige
Lebenszyklus-Zeile** ist angefallen — `audit_lifecycle_exempt` hat für Anlage und
Löschung der Fixtures gegriffen; durchgekommen ist nur der Feld-Audit, der von
der Ausnahme nicht abgedeckt ist. Das ist genau **PROJ-Y-45e**. Bewusst nicht
über den Runbook-Weg (`session_replication_role = replica`) entfernt: dafür
müssten in Produktion die Append-only-Wächter abgeschaltet werden, und dieses
Risiko ist größer als 16 synthetische Zeilen in Testmandanten. Dazu **eine
Protokollzeile je Lauf** in `confidential_read_log` (ebenfalls append-only,
δ1/PROJ-Y-130n) — der Preis dafür, dass die Protokoll-Prüfung nicht ins Leere
greift.

#### Abweichungen

Die fünf Abweichungen aus `/frontend` (D-α.1 … D-α.5) bleiben unverändert
gültig. Neu hinzu:

- **D-α.6 — kein authentifizierter Durchlauf für `strict`-Sichtbarkeit.** Die
  Browser-Prüfung des Protokolls läuft als Mandanten-Admin, für den
  `can_access_classified` kurzschließt; geprüft wird dort das **Protokoll**, nicht
  das Tor. Das Tor selbst ist im Live-Pentest belegt (`T`/`U`: `strict` verborgen,
  auch gegen eine Klartextsuche im Markdown) — bewusst dort, weil ein
  Nicht-Admin-Mitglied in Prod synthetisiert werden muss.
- **D-α.7 — Mobile Safari übersprungen** (WebKit-Host-Bibliotheken, PROJ-67/F2).

## Deployment

### `/deploy` 2026-09-01 — Tag `v2.89.0-PROJ-80`, Scope **`alpha`**

**Was heute passiert ist, ehrlich benannt: Buchführung, kein Auslieferungsvorgang.** Der Code ist mit
`7feb4c9` (PR #399) am **2026-08-21** auf `main` gegangen und damit über den Vercel-Auto-Deploy live;
die drei Migrationen liegen seit `/backend` am 2026-08-14 in Prod (registriert `20260814075847` ·
`20260814120847` · `20260814125712` — die Versionsdrift gegenüber den Dateinamen ist die bekannte
PROJ-134-Domäne, alle drei sind angewendet). Offen war allein, dass die Slice nie als `Deployed`
gebucht und nie getaggt wurde — sie stand seit zehn Tagen auf `Approved`. Kein Runtime-DB-Change,
kein `src/`-Diff in diesem Schritt.

**Der ausgelieferte Stand enthält einen Sicherheitsfix, der nach der QA kam:** **PROJ-Y-151f**
(`a9eb883`, 2026-08-28) hat geschlossen, dass die Skill-Anweisungen des Quintessenz-Zwecks am
Class-3-Gate **vorbei** liefen — `classifyDocumentSummaryAutoContext` prüfte Dokumenttext und
Dateinamen, nicht aber die (per PROJ-77 änderbaren) Skill-Anweisungen, die als System-Prompt an den
Anbieter gehen. Für Invariante #3 ist „daran vorbei“ derselbe Bruch wie „ausgehebelt“. Exposition in
Prod war zum Zeitpunkt des Fixes **null** (0 Dokumente, 0 Quintessenzen, 0 nachgesäte Skills).

#### Prod eigenständig nachgemessen statt aus den Notizen übernommen

| Prüfung | Ergebnis |
|---|---|
| Tabellen mit aktivem RLS | `document_extractions` **true**, `document_summaries` **true** |
| Policies über beide Tabellen | **10** |
| Auflöser `_dms_document_ctx` | `SECURITY DEFINER`, `search_path=public, pg_temp` |
| Trigger über beide Tabellen | **6** |
| Zweck `document_summary` im Lockstep | in `ki_runs_purpose_check` **und** `tenant_ai_cost_caps_purpose_check` |
| Objektarten im Protokoll | `document_extractions` **und** `document_summaries` im `audit_log_entity_type_check` |
| `anon` **und** PUBLIC ohne EXECUTE | über **alle drei** neuen Funktionen (`_dms_document_ctx`, `ensure_summarizer_skill`, `_skills_protect_builtin_delete`) |
| Löschschutz-Trigger auf `skills` | vorhanden und **aktiv** (`tgenabled='O'`) |
| Advisors | **0 ERROR** / 157 WARN — die **2** PROJ-80-Meldungen sind wörtlich die Kategorie, die `_dms_node_ctx` seit PROJ-Y-115c trägt (155 Bestandsfälle) |

Die PUBLIC-Hälfte ist ausdrücklich mitgeprüft und nicht als Stichprobe: ein Entzug nur von
`anon`/`authenticated` lässt den PUBLIC-Eintrag stehen, der mit `=` **beginnt** (PROJ-Y-114a-Lehre,
im Haus mehrfach aufgetreten). Alle drei Funktionen tragen `search_path`; die Wächter-Funktion
`_skills_protect_builtin_delete` ist zusätzlich für `authenticated` gesperrt — richtig für eine
Funktion, die nur als Trigger läuft.

#### Auslieferung und Laufzeit

Das aktuelle Produktions-Deployment (`dpl_Fgy56VWhPhjeiDDyvtoDxgYBk8fU`, **READY**, `target: production`)
ist aus `2be71be` gebaut, und `7feb4c9` ist als dessen **Vorfahre** verifiziert — der PROJ-80-Code läuft
also nachweislich in der ausgelieferten Fassung, gegengeprüft am Dateibaum des ausgelieferten Commits
(vier Routen-/Lib-Dateien plus Fläche und Runner). **Laufzeitfehler auf PROJ-80-Routen im 7-Tage-Fenster:
keine** — die einzige Fehlergruppe des Projekts ist der 300-s-Zeitüberlauf auf
`/api/projects/[id]/ai/stakeholder-proposals`, zuletzt am 2026-08-27 19:53 und damit **vor** PROJ-152s
Zeitbudget; sie berührt diese Slice nicht.

#### Post-Deploy-Smoke — mit der Gegenprobe, die ihn erst aussagekräftig macht

Fünf Flächen gegen Produktion, jeweils **exakt 307** mit Rumpf `Redirecting...`, kein Leck:
`GET`/`PATCH …/documents/[docId]/summary`, `POST …/summary/retry`, `/projects/[id]/dokumente`.
**Und ein erfundener Pfad (`…/gibtesnicht-erfunden`) antwortet ebenfalls 307** — der Smoke belegt damit
das **Auth-Gate**, ausdrücklich **nicht** die Existenz der Routen. Die Existenz ist am Dateibaum des
ausgelieferten Commits belegt, nicht aus dem Statuscode gefolgert (PROJ-45-Lehre, hier gemessen statt
zitiert). Der Auth-Redirect allein ist nach Hausregel kein funktionaler Nachweis; tragend bleiben der
Live-Pentest 10/10 + Rot-Team 13/13 + 9/9 aus der QA und die Kette über eine echte Sitzung.

#### Warum `alpha` und nicht `full`, `mvp` oder `tooling-only`

- **`full` scheidet aus**, weil **ursprüngliche** Akzeptanzkriterien zurückgestellt sind, jedes mit
  Ziel-Kennung: Vektorindex/Chunking/Embeddings/`document_chunks` (→ **PROJ-80-β**), XLSX und PPTX
  (→ **PROJ-Y-80c**), Reiter „Verlinkungen“ (→ **PROJ-Y-80a**), Umschalter „Vollständig/Quintessenz“
  (→ **PROJ-Y-80b**) sowie der echte Anbieter-Lauf (→ **PROJ-Y-80d**, ein offenes Kriterium, keine
  Abweichung). Die Ausnahme „Waived criterion“ scheitert schon an ihrer **ersten** Bedingung
  („nothing was deferred“).
- **`mvp` scheidet aus**, weil `mvp` eine abgeschlossene MVP-Grenze behauptet, hinter der kein
  *benannter Sub-Slice* mehr steht. Hier ist **β** genau das: benannt, mit eigenem Zuschnitt und
  CIA-Pflicht registriert. Das ist wörtlich die `alpha`-Definition (Präzedenz: PROJ-79 `alpha` mit
  offenem β, PROJ-44, PROJ-96; PROJ-45 stieg erst von `alpha` auf `mvp`, als **alle** benannten
  Sub-Slices ausgeliefert waren).
- **`tooling-only` scheidet aus**: geliefert ist Produkt-Laufzeitfähigkeit (Extraktion,
  Volltext-Klassifikation auf dem DMS-Pfad, Quintessenz-Erzeugung, Fläche mit Handänderung), keine
  Werkzeug-Ebene.
- **`alpha` trifft Bedingung für Bedingung:** ein benannter Sub-Slice mit eigenen Kriterien hat QA
  bestanden (2026-08-21, **0 Critical / 0 High / 0 Medium / 0 Low**) und ist ausgeliefert; die Spec
  listet den verbleibenden Slice (β) samt Abhängigkeit („bis das DMS Dokumente enthält“) und jedes
  ausgelassene ursprüngliche Kriterium mit Ziel-Kennung.

#### Die gelieferte Grenze

Extraktion am DMS-Upload (PROJ-70-Stack) → **Volltext-Klassifikation auf dem DMS-Pfad, den es vorher
gar nicht gab** (PROJ-75-Muster ausgedehnt, fail-closed) → Quintessenz über einen gewöhnlichen
`cross_cutting`-Skill (PROJ-76, je Mandant nachgesät, per PROJ-77 änderbar aber nicht löschbar) →
Dokument-Detailseite mit Reitern *Vorschau* und *Quintessenz*, Handänderung mit optimistischer Sperre
und Bestätigungsdialog vor dem Überschreiben. **Retrieval ist nicht dabei** — „Vollständig“ ist in α
schlicht der ganze herausgelöste Text; top-k ersetzt das erst β.

#### Offen nach diesem Deploy

**PROJ-80-β** (Retrieval, CIA-pflichtig) · **PROJ-Y-80a** (Reiter „Verlinkungen“) · **PROJ-Y-80b**
(Umschalter) · **PROJ-Y-80c** (XLSX/PPTX, überlappt PROJ-73) · **PROJ-Y-80d** (echter Anbieter-Lauf).
Nicht dieser Slice zuzurechnen und getrennt registriert: **PROJ-Y-80e** (`TRUNCATE`-Grants im Bestand),
**PROJ-Y-80f** (`seed_risk_categories_if_empty` ist `anon`-ausführbar, PROJ-107), **PROJ-Y-114d**
(Funktions-Inventar-Wächter), **PROJ-Y-45e** (Feld-Audit-Rückstände aus Testläufen).

#### Abweichung dieses Schritts

- **D-α.8 — kein neuer Testlauf gegen Produktion.** Der Deploy ist reine Buchführung ohne `src/`-Diff;
  die funktionalen Nachweise stammen aus der QA vom 2026-08-21 und sind dort datiert. Neu und heute
  gemessen sind ausschließlich der Prod-Zustand (Tabelle oben), das Laufzeitfenster und der Smoke.
