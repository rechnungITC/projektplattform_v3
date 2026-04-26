# PROJ-12: KI Assistance and Data-Privacy Paths

## Status: Planned
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
Builds the platform's AI integration layer: a single model-routing component (cloud Claude vs local Ollama), a class-3 hard block that prevents personal data from reaching external models, KI proposals for planning units (work items, risks, decisions) generated only after explicit user action, and a review/approve flow that never auto-mutates business data. Also covers F12.1 privacy classification, F12.2 traceability, F12.3 contextual compliance hints, and F2.1b KI-driven wizard alternative. Inherits V2 EP-10.

## Dependencies
- Requires: PROJ-1 (Auth, Tenants, Roles)
- Requires: PROJ-2 (Project CRUD) — KI proposals scoped per project
- Requires: PROJ-8 (Stakeholders) — class-3 marker
- Requires: PROJ-9 (Work Items) — proposals target these
- Requires: PROJ-10 (Audit) — proposals + acceptance audited
- Influences: PROJ-13 (KI-drafted communication), PROJ-14 (MCP bridge)
- Hard prerequisite for any AI feature in V3

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-10-ki-assistenz-und-datenschutz.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-10.md` (ST-01 model routing, ST-02 class-3 block, ST-03 proposal generation, ST-04 review/approve flow, F12.1 privacy config, F12.2 traceability, F10.2 model selection, F12.3 compliance hints) plus EP-03 F2.1b KI-driven wizard alternative
- **ADRs:** `docs/decisions/data-privacy-classification.md`, `docs/decisions/metamodel-infra-followups.md` (Ollama provider)
- **V2 code paths to study during /architecture and /backend:**
  - `apps/api/src/projektplattform_api/services/ai/router.py` — model router with class-3 check
  - `apps/api/src/projektplattform_api/services/ai/data_privacy.py` — `classify_field`, `classify_payload`
  - `apps/api/src/projektplattform_api/services/ai/providers/{anthropic,ollama}.py`
  - `apps/api/src/projektplattform_api/routers/work_item_suggestions.py`

## User Stories
- **[V2 EP-10-ST-01]** As an operator, I want a single AI abstraction layer so that different models can be plugged per use case.
- **[V2 EP-10-ST-02]** As an operator, I want personal data technically blocked from external AI so that GDPR is enforced, not just policy.
- **[V2 EP-10-ST-03]** As a user, I want KI proposals for planning units derived from my project context after I ask for them.
- **[V2 EP-10-ST-04]** As a user, I want to review, accept, reject, or edit each KI proposal before it lands as active project data.
- **[V2 F12.1]** As an operator, I want the data privacy base configuration (3-class scheme + GDPR storage concept) implemented from day one.
- **[V2 F12.2]** As a project lead, I want every AI-generated piece tagged with origin, model, and validation status so that traceability holds.
- **[V2 F10.2]** As a sysadmin, I want per-tenant model-selection configuration with hard block on class 3 → cloud.
- **[V2 F12.3]** As a project lead, I want context-aware compliance hints derived from project type so I consider GDPR/works-council/IT-Sec early.
- **[V2 F2.1b]** As a project owner, I optionally want to use a KI-guided dialog instead of the regular wizard.

## Acceptance Criteria

### Model routing (ST-01)
- [ ] Single `aiRouter.invoke({ purpose, payload, classification, tenant_id })` API in `src/lib/ai/router.ts` (or Edge Function).
- [ ] Routes to Anthropic (Claude) for class-1/2; routes to local Ollama (or stub) for class-3.
- [ ] Logs every call: timestamp, tenant, project, purpose, classification, chosen provider, success/error.
- [ ] Errors from the model are caught and returned as structured error envelopes; UI surfaces a friendly message.

### Class-3 block (ST-02)
- [ ] A central `classifyPayload(payload)` helper inspects every field of an outgoing payload and returns the highest data class involved.
- [ ] If `classification = 3`, external (cloud) routing is rejected with `403 / external-blocked`. No bypass — even tenant admins cannot override.
- [ ] Block events logged with timestamp, user, tenant, project.
- [ ] User-facing message: "External AI is not permitted for this content (contains personal data)."

### Privacy classification (F12.1)
- [ ] Field-level classification registry: `{ table.column → 1|2|3 }`. Default unspecified = 3.
- [ ] Stored as a TypeScript module (`src/lib/ai/data-privacy-registry.ts`) for the V3 stack — derived from V2's `data_privacy.py`.
- [ ] Initial classifications match V2's data-privacy-classification.md table (project name=2, type=1, lifecycle=1, profile email=3, stakeholder name/email=3, etc.).
- [ ] GDPR delete concept documented: depersonalize the original record, audit rows age out via retention.
- [ ] DSGVO export (Art. 15/20) endpoint deferred to PROJ-17 (tenant admin can trigger a redacted export).

### Proposal generation (ST-03)
- [ ] `POST /api/projects/[id]/ki/suggest` with body `{ purpose: 'work_items'|'risks'|'decisions', context: ... }` triggers a proposal run.
- [ ] Proposals stored in `work_item_suggestions` (or `ki_suggestions`) with status `draft`, full provenance metadata.
- [ ] Proposals are method-aware (only kinds visible for the project's method are proposed).
- [ ] Proposals do NOT mutate active project objects — only the suggestion table.
- [ ] Generation requires explicit user action; no background polling that costs tokens silently.

### Review + approve flow (ST-04)
- [ ] UI tab "KI Vorschläge" shows pending proposals.
- [ ] Per proposal: Accept (creates the real entity), Reject (marks rejected), Edit (allows inline edit before accept).
- [ ] Acceptance creates the actual `work_items` (or risks/decisions/etc) row, audited with `change_reason='ki_acceptance'` and a link back to the suggestion.
- [ ] Rejection logs reason (optional free text).
- [ ] No mass-acceptance.
- [ ] No automatic acceptance by rules.

### Traceability (F12.2)
- [ ] Every AI-generated record carries metadata: `created_via='ki', ki_run_id, ki_model, ki_timestamp, ki_status (draft|accepted|rejected|modified)`.
- [ ] Detail view shows the metadata badge.
- [ ] Filter "AI-derived only" available on lists.
- [ ] Exportable AI-event log (per PROJ-10 audit + a dedicated view).

### Per-tenant model selection (F10.2)
- [ ] `tenant_settings.ai_provider_config` JSONB stores per-tenant: `{ external_provider: 'anthropic'|'none', local_provider: 'ollama'|'stub', ollama_base_url? }`.
- [ ] Admin UI in PROJ-17 lets a tenant admin select.
- [ ] Class-3 hard block applies regardless of config.

### Compliance hints (F12.3)
- [ ] Catalog `compliance_hints` keyed by project type (e.g. ERP → GDPR, works-council, IT security; software → license check).
- [ ] Hints are recommendations, never blockers.
- [ ] Each hint has an "Acknowledge" button that records actor + optional comment in audit log.

### KI-driven wizard alternative (F2.1b)
- [ ] Optional "Use KI-Dialog" toggle on the wizard entry (PROJ-5 integration).
- [ ] Free-text dialog extracts master data into the same wizard's Review step — never auto-creates a project.
- [ ] Class-3 input blocked from the external model.

## Edge Cases
- **Tenant admin tries to disable class-3 block** → not possible by design (no setting exposes it).
- **Stand-alone deployment with no external AI** → `external_provider='none'`; all AI calls route local; if local is unavailable, calls fail with a clear message (no silent cloud fallback).
- **Proposal accepted on a project that since changed methods** → if the kind is no longer visible, acceptance creates the row anyway (history honored), UI hides it as per method visibility (PROJ-9).
- **Proposal rejected, then user wants to undo the rejection** → re-running generation is the path; no "un-reject" button v1.
- **AI run timeout** → caller sees error; partial proposals not persisted.
- **Cost limit per tenant exceeded** → block + clear error; tracked in tenant_settings (deferred to PROJ-17).
- **Ollama base URL unreachable** → class-3 path fails gracefully; log + UI message.
- **User edits a proposal then accepts** → metadata says `ki_status='modified'`; audit shows what user changed.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase Edge Functions (TypeScript) + Anthropic SDK + Ollama HTTP client. Use Anthropic prompt caching for repeated context.
- **Multi-tenant:** All AI run logs and suggestion tables MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS on `ki_suggestions`: project members for read; only system + admin for write.
- **Validation:** Zod for the suggestion payload; runtime type-narrowing on `classification`.
- **Auth:** Supabase Auth + project role checks.
- **Privacy:** Hard `classifyPayload` check before any external call; logged; no bypass.
- **Provider abstraction:** Strategy pattern: `AIProvider` interface with `Anthropic`, `Ollama`, `Stub` implementations.
- **Performance:** Long-running generations as Edge Functions with streaming; UI shows progress.

## Out of Scope (deferred or explicit non-goals)
- Auto-anonymization of class-3 fields.
- KI-based legal evaluation.
- Exception-approval workflow that bypasses class-3 block.
- Self-evaluation of model output ("how confident is this?") beyond model-reported confidence.
- Fine-tuning.
- KI-generated communication content (PROJ-13).
- MCP bridge (covered in PROJ-14).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## Implementation Notes
_To be added by /frontend and /backend_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
