# PROJ-84: KI-Kennzeichnung + erweiterter Audit-Trail

## Status: Planned (überwiegend erfüllt — Restumfang neu geschnitten)
**Created:** 2026-06-06
**Last Updated:** 2026-09-01

> **Der größte Teil dieser Story ist inzwischen gebaut, unter anderen Namen.** `ki_runs` trägt 11 der
> 14 Felder des geforderten Aktionsprotokolls, `ki_provenance.was_modified` ist der geforderte
> Bearbeitungs-Indikator, PROJ-130 hat den Audit-Trail append-only mit Hash-Kette, Revisionszugang
> und redigierendem Export ausgeliefert, und in der Oberfläche gibt es KI-Marker an Work-Items, in der
> Historie und an Stakeholder-Teilnehmern. Eine neue `ai_action_logs`-Tabelle wäre eine **zweite
> Wahrheit** neben `ki_runs`; ein `ai_origin` auf `documents` eine **zweite Spalte** neben dem
> vorhandenen `ai_generated_metadata`. Siehe Erdung 2026-09-01.

## Summary
Cross-cutting compliance story. Every artifact that was created or modified by an AI agent — work items from PROJ-82, documents from PROJ-83, summaries from PROJ-80, plus any future AI-touched entity — carries a visible AI-generated marker in the UI and exports. The existing PROJ-10 audit foundation is extended with a dedicated AI-action log capturing skill invocations, RAG reads, generation events, and proposal lifecycle. Provides an export endpoint for compliance and Betriebsrat-Mitbestimmungsausschüsse.

## Dependencies
- Requires: PROJ-10 (Audit Foundation)
- Requires: PROJ-12 (AI Proposal Layer)
- Requires: PROJ-76 (Skill-Framework)
- Requires: PROJ-80, PROJ-82, PROJ-83 (the AI-emitters)
- Influences: every artifact-rendering surface (work items, documents, summaries)

## V2 Reference Material
- ADR `architecture-principles` (AI as proposal layer).
- ADR `data-privacy-classification` (data classes drive what can be processed where).

## User Stories
- **[V3 SK-34]** As a PM, I want every AI-generated artifact (story, task, risk, document, summary) to carry a visible marker, so that I always know what came from a human and what from a Skill.
- **[V3 SK-35]** As a tenant admin, I want a comprehensive AI-action log capturing skill invocations, RAG reads, generation events, and proposal acceptances/rejections, so that we have a defensible audit trail for compliance and Betriebsrat reviews.
- **[V3 SK-36]** As a tenant admin, I want an export endpoint that produces a structured audit report for a given date range and project, so that I can hand over evidence to Betriebsrat or auditors.
- **[V3 SK-37]** As a PM, I want a clear indicator when I edit an AI-generated artifact, so that a human-edited variant is distinguished from the raw AI output.

## Acceptance Criteria

### AI-artifact tagging
- [ ] ~~Existing tables that may carry AI-origin content add column: `ai_origin JSONB NULL`~~
      **Umgeschnitten.** `documents` trägt seit PROJ-79-α `ai_generated boolean` **und**
      `ai_generated_metadata jsonb` — eine zweite Spalte gleicher Bedeutung ist genau das Muster, das
      PROJ-Y-130s als „Geisterspalte" und PROJ-157 als „zweite Form ohne eigenen Inhalt" behandelt.
      Für `documents` ist die Achse also **vorhanden und zu nutzen**; für die übrigen Tabellen ist zu
      entscheiden, ob der Marker eine eigene Spalte braucht oder aus der bestehenden
      `ki_provenance`-Kette abgeleitet wird (`entity_type`/`entity_id` decken heute jede über einen
      Vorschlag angenommene Zeile ab). Ursprüngliche Feldform bleibt darunter dokumentiert:
      `ai_origin JSONB NULL` with shape: `{ skill_id, skill_version_id, generated_at, generation_method: 'proposal'|'document_generation'|'summarization', conversation_ref?, edited_by_user_id?, edited_at? }`.
- [ ] `ai_origin` complements, but does not replace, the existing PROJ-12 `ki_provenance` chain (`ki_runs` → `ki_suggestions` → accepted entity). Accepted proposals keep their immutable provenance row; `ai_origin` is the compact UI/export marker on the target artifact.
- [ ] Betroffene Tabellen — Stand gemessen: `documents` **hat** die Achse (PROJ-79-α);
      `work_items`/`risks` sind über `ki_provenance` bereits erfasst, sobald sie aus einem Vorschlag
      entstanden (PROJ-70/88/89); `document_summaries` entsteht **immer** maschinell, ein Marker je
      Zeile wäre dort redundant zur Tabellenbedeutung. Offen sind damit real nur `budgets`, `phases`,
      `milestones` — und für die gibt es heute **keinen** KI-Erzeugungspfad, also wäre die Spalte
      konstant leer. Zu entscheiden statt vorzuschreiben.
- [ ] When a row's `ai_origin` is non-null, UI renders an "AI-generiert"-badge with tooltip showing skill name + version.
- [ ] When a user edits an AI-generated row, `ai_origin.edited_by_user_id` and `edited_at` are set; UI badge changes to "AI-generiert, von Nutzer überarbeitet".

### ~~`ai_action_logs` table~~ → `ki_runs` vervollständigen

**Gemessen am 2026-09-01:** `ki_runs` trägt heute `tenant_id · project_id · actor_user_id · purpose ·
provider · model_id · status · input_tokens · output_tokens · latency_ms · reason_code · created_at`
— **11 der 14** geforderten Felder, und `reason_code` (PROJ-137) ist sogar schärfer als das
ursprünglich gedachte `payload`. Fehlen: `skill_id`, `skill_version_id`, `target_table`/
`target_row_id`, `rag_document_ids`. Eine zweite Tabelle würde denselben Vorgang zweimal
protokollieren und die Frage „welches ist die Wahrheit" dauerhaft offenhalten. Die ursprüngliche
Feldliste bleibt als Zielbild darunter stehen:
- [ ] `id UUID PK, tenant_id UUID NOT NULL, project_id UUID NULL, actor_user_id UUID NOT NULL, action_type TEXT NOT NULL CHECK (action_type IN ('skill_invoked','rag_read','proposal_created','proposal_accepted','proposal_rejected','document_generated','prompt_exported','summary_generated','summary_edited','skill_action_denied','rate_limit_hit')), skill_id UUID NULL, skill_version_id UUID NULL, target_table TEXT NULL, target_row_id UUID NULL, rag_document_ids UUID[] NULL, model_used TEXT NULL, token_count INT NULL, latency_ms INT NULL, payload JSONB NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- [ ] Index on `(tenant_id, project_id, occurred_at DESC)` for fast project audit queries.
- [ ] ~~Retention: 24 months by default, tenant override configurable.~~
      **Widerspricht dem ausgelieferten Stand.** PROJ-130 hat die Aufbewahrung per PO-Lock auf
      **unbegrenzt** gestellt und den Purge abgeschafft — `/api/cron/apply-retention` antwortet
      nachweislich mit `audit_purge: "disabled"`, das Retention-Feld der Tenant-Oberfläche ist
      deaktiviert und erklärt. Ein neues KI-Protokoll mit 24-Monats-Frist würde die Zusage „der Trail
      hat keinen Löschpfad" an einer Nebentür aufheben. Aufbewahrung folgt daher PROJ-130; die
      DSGVO-Frage dazu ist eigens als PROJ-Y-148b in Arbeit.

### Export endpoint
- [ ] KI-Filter auf dem **bestehenden** Export statt einer neuen Route: `/api/audit/export` existiert
      seit PROJ-130-γ4 mit Class-3-Redaktion, `redaction_off` als Admin-Vorbehalt und Zugang für
      befristete Revisoren (`audit_reader_grants`). Eine zweite Export-Route müsste Redaktion,
      Berechtigung und Manifest neu implementieren — dreifach Gelegenheit, sie anders zu machen.
      Ursprüngliche Form bleibt als Zielbild: `?project_id=&from=&to=&format=csv|json`, admin only.
- [ ] Returns a structured report: rows of `ai_action_logs` joined with skill name and project name; PII-classified fields redacted unless requester has `compliance_officer` role.
- [ ] Includes a manifest header: tenant_id, generated_at, generated_by, query_params.
- [ ] Cross-tenant requests → 404.

### UI surfaces
- [ ] AI-Badge als **geteilte** Komponente. Heute existiert der Marker **funktional, aber dreifach
      kopiert**: `work-item-detail-drawer.tsx:440` („KI-Vorschlag"), `audit/history-tab.tsx:60` („Aus
      KI-Vorschlag übernommen"), `participant-pills-strip.tsx:56` („KI-Vorschlag, ungeprüft"). Der
      Zuwachs dieser Story ist also **nicht** „einen Marker einführen", sondern drei Fassungen zu
      **einer** zusammenzuführen und die fehlenden Flächen anzuschließen — dieselbe Bewegung wie bei
      `AuditChainResult` (PROJ-Y-130m) und `AuditReportView` (PROJ-Y-130p).
- [ ] Admin route `/admin/audit/ai` — paginated list of `ai_action_logs` with filters (action_type, skill, project, date range).
- [ ] Document detail (PROJ-79) shows `ai_origin` block prominently when set.

### Edit-detection
- [ ] Bearbeitung durch Menschen kennzeichnen — **teilweise vorhanden**:
      `ki_provenance.was_modified boolean` existiert seit PROJ-12 und wird beim Übernehmen eines
      inline bearbeiteten Vorschlags gesetzt. Der Feld-Diff selbst steht ohnehin im PROJ-10-Feldaudit,
      das seit PROJ-Y-130s **472** getrackte Spalten führt und seit PROJ-130-α append-only ist. Neu
      ist also nur die **Anzeige** der Unterscheidung, nicht ihre Erfassung.
- [ ] If the entire content is replaced (rough heuristic: text similarity below 30 %), the badge changes to "Ursprünglich AI-generiert, vollständig überarbeitet".

### Rate-limit and cost ledger hook
- [ ] On every skill invocation, increment per-tenant token counter.
- [ ] If tenant exceeds license-tier cap, `rate_limit_hit` is logged and the invocation endpoint returns 429.
- [ ] (Hard limits per tier remain open question pending pricing decision.)

## Edge Cases
- **Backfill** for AI-touched data created before this story ships → not retroactively tagged; flagged via release note.
- **User edits a field, then reverts** → ai_origin.edited_by stays set with edit_count increment.
- **Audit export request for a huge date range** → result streamed and capped at 500 k rows; UI offers smaller chunks if cap hit.
- **PII in payload of `ai_action_logs`** → `payload` JSONB is schema-validated and PII-stripped at write time per `data-privacy-classification` ADR.
- **AI-generated document is moved to another project** (PROJ-79) → `ai_origin` follows; `ai_action_logs.project_id` is updated by a system event `ai_artifact.relocated`.
- **Skill version is rolled back (PROJ-76) after artifacts were generated** → `ai_origin.skill_version_id` still references the original (immutable) version row.
- **Cross-tenant export attempt** → 404.
- **Compliance export contains entries for documents the requesting admin would not normally see** → admin role permits; non-admin attempts blocked.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase, shadcn/ui (`Badge`, `Tooltip`, `Table`, `DataTable`).
- **Multi-tenant:** every new column and table carries `tenant_id`; RLS via `is_tenant_admin()` for the audit log; per-project membership for badge rendering.
- **Validation:** Zod for `ai_origin` JSONB schema; CHECK constraint on `action_type` enum.
- **Auth:** Supabase Auth; admin gate for audit endpoints.
- **Performance:** Audit list cached for 30 s per admin session; export endpoint streams chunked response.
- **Retention job:** nightly cron purges `ai_action_logs` older than `tenant_retention_months`.
- **Audit hook:** PROJ-10 still receives mutation events; `ai_action_logs` is the dedicated AI-event sink and is queried separately for AI-specific reports.

## Out of Scope
- Real-time monitoring dashboard (V2).
- Anomaly detection on AI usage patterns (V2).
- Cross-tenant aggregate analytics (never — by privacy charter).
- Automated Betriebsrat-Report-Generierung (out of scope of this story; Betriebsrat use cases are the consumer of the export endpoint).
- E-signature / cryptographic chain of custody on audit log entries.

## Geerdet am 2026-09-01 (PROJ-165)

### Der Befund in einem Satz

Diese Story wollte ein KI-Protokoll, eine Herkunftsspalte, einen Export und ein Badge bauen. Drei
davon existieren inzwischen — unter anderen Namen, von anderen Slices, und in Teilen schärfer als
hier gefordert. Der ehrliche Restumfang ist **Zusammenführen und Vervollständigen**, nicht Neubau.

### Messungen

| Gefordert | Gemessener Stand 2026-09-01 |
|---|---|
| `ai_action_logs` (14 Felder) | `ki_runs` trägt **11** davon; fehlen `skill_id`, `skill_version_id`, `target_table`/`target_row_id`, `rag_document_ids`. `reason_code` (PROJ-137) ist zusätzlich da |
| Herkunftsmarker an Artefakten | `documents.ai_generated` + `ai_generated_metadata` (PROJ-79-α); `ki_provenance(entity_type, entity_id)` für jede aus Vorschlägen angenommene Zeile |
| Indikator „von Nutzer überarbeitet" | `ki_provenance.was_modified` **existiert** |
| Export für Compliance | `/api/audit/export` mit Redaktion, Admin-Vorbehalt für `redaction_off`, Revisoren-Zugang (PROJ-130-γ4/γ2) |
| Sichtbares Badge | **funktional vorhanden, dreifach kopiert** (Work-Item-Drawer, Audit-Historie, Teilnehmer-Pills) |
| Append-only, manipulationssicher | PROJ-130-α bis ε: Guard-Trigger für jede Rolle, Hash-Anker mit Verifikationslauf, Zugriffsprotokoll |
| Retention 24 Monate | **widerlegt** — `audit_purge: "disabled"`, Aufbewahrung unbegrenzt per PO-Lock |
| `ai_action_logs`, `ai_origin`, `task_document_links` als Namen | je **0** Treffer in Migrationen und `src/` |

### Was daraus folgt

- **Erweitern statt anlegen.** Vier Felder an `ki_runs` und ein KI-Filter am bestehenden Export sind
  der Kern. Das ist eine kleine Slice, nicht die ursprünglich gedachte große.
- **Ein Badge statt drei.** Die Zusammenführung ist der eigentliche Produktzuwachs, weil drei
  Fassungen desselben Markers auseinanderlaufen — im Repo mehrfach belegte Fäulnis.
- **Die Aufbewahrungsfrage ist entschieden und liegt nicht hier.** PROJ-130 hat sie umgekehrt,
  PROJ-Y-148b behandelt die DSGVO-Seite.
- **Nicht entschieden** ist, ob `budgets`/`phases`/`milestones` überhaupt einen Marker brauchen: für
  sie existiert heute **kein** KI-Erzeugungspfad, die Spalte wäre konstant leer — und eine leere
  Spalte ist von „nie geprüft" nicht zu unterscheiden.

### Eine Grenze der Erdung

Gemessen ist an **Code und Migrationsdateien**, nicht gegen Prod. Für „existiert das Primitiv" trägt
das; für Aussagen über Zeilenzahlen (wie viele `ki_runs` je Zweck, wie viele `ki_provenance`-Zeilen
mit `was_modified`) bräuchte es eine Live-Abfrage. Sie ist für die Urteile hier nicht nötig und
wurde nicht behauptet.

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be filled by /architecture._

## Implementation Notes
_To be added by /frontend and /backend._

## QA Test Results
_To be added by /qa._

## Deployment
_To be added by /deploy._
