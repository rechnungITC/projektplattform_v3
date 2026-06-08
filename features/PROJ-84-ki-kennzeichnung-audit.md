# PROJ-84: KI-Kennzeichnung + erweiterter Audit-Trail

## Status: Planned
**Created:** 2026-06-06
**Last Updated:** 2026-06-07

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
- [ ] Existing tables that may carry AI-origin content add column: `ai_origin JSONB NULL` with shape: `{ skill_id, skill_version_id, generated_at, generation_method: 'proposal'|'document_generation'|'summarization', conversation_ref?, edited_by_user_id?, edited_at? }`.
- [ ] `ai_origin` complements, but does not replace, the existing PROJ-12 `ki_provenance` chain (`ki_runs` → `ki_suggestions` → accepted entity). Accepted proposals keep their immutable provenance row; `ai_origin` is the compact UI/export marker on the target artifact.
- [ ] Affected tables: `work_items` (added by PROJ-9 extension), `documents` (added by PROJ-79), `document_summaries` (added by PROJ-80), `risks`, `budgets`, `phases`, `milestones`.
- [ ] When a row's `ai_origin` is non-null, UI renders an "AI-generiert"-badge with tooltip showing skill name + version.
- [ ] When a user edits an AI-generated row, `ai_origin.edited_by_user_id` and `edited_at` are set; UI badge changes to "AI-generiert, von Nutzer überarbeitet".

### `ai_action_logs` table
- [ ] `id UUID PK, tenant_id UUID NOT NULL, project_id UUID NULL, actor_user_id UUID NOT NULL, action_type TEXT NOT NULL CHECK (action_type IN ('skill_invoked','rag_read','proposal_created','proposal_accepted','proposal_rejected','document_generated','prompt_exported','summary_generated','summary_edited','skill_action_denied','rate_limit_hit')), skill_id UUID NULL, skill_version_id UUID NULL, target_table TEXT NULL, target_row_id UUID NULL, rag_document_ids UUID[] NULL, model_used TEXT NULL, token_count INT NULL, latency_ms INT NULL, payload JSONB NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- [ ] Index on `(tenant_id, project_id, occurred_at DESC)` for fast project audit queries.
- [ ] Retention: 24 months by default (per ADR `data-privacy-classification`), tenant override configurable.

### Export endpoint
- [ ] `GET /api/admin/audit/ai-export?project_id=&from=&to=&format=csv|json` — admin only.
- [ ] Returns a structured report: rows of `ai_action_logs` joined with skill name and project name; PII-classified fields redacted unless requester has `compliance_officer` role.
- [ ] Includes a manifest header: tenant_id, generated_at, generated_by, query_params.
- [ ] Cross-tenant requests → 404.

### UI surfaces
- [ ] AI-Badge component (`<AiOriginBadge ai_origin={...} />`) reused across work items, documents, summaries, etc.
- [ ] Admin route `/admin/audit/ai` — paginated list of `ai_action_logs` with filters (action_type, skill, project, date range).
- [ ] Document detail (PROJ-79) shows `ai_origin` block prominently when set.

### Edit-detection
- [ ] On PATCH of an AI-generated row, an `ai_action_logs` event `ai_artifact.edited_by_user` is recorded with diff metadata (which fields changed).
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

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be filled by /architecture._

## Implementation Notes
_To be added by /frontend and /backend._

## QA Test Results
_To be added by /qa._

## Deployment
_To be added by /deploy._
