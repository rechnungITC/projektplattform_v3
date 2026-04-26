# PROJ-20: Risks & Decisions Catalog (Cross-cutting Governance Backbone)

## Status: Planned
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
Cross-cutting governance backbone: Risks (with score, mitigation, status) and Decisions (immutable, dated, with rationale, optional revision link) as first-class project entities. V2's Risk register (F4.2) lives operationally inside the project room (PROJ-7), but the immutable Decision concept — distinct from Open Items and Tasks per V2's `term-boundaries.md` — needs its own home. PROJ-20 is the place. Open Items also fit here as a lightweight clarification artifact.

## Dependencies
- Requires: PROJ-1 (Auth, Tenants, Roles)
- Requires: PROJ-2 (Project CRUD)
- Requires: PROJ-8 (Stakeholders) — decision references stakeholders
- Requires: PROJ-10 (Audit)
- Influences: PROJ-7 (Project Room — Risks already there; Decisions tab added)
- Influences: PROJ-12 (KI proposals can produce decision drafts — never auto-decide)

## V2 Reference Material
- **Epic file:** N/A — Risks live in V2 EP-05 (F4.2). Decisions live in V2's term-boundaries doc but not in a single epic. The V3 user prompt requested PROJ-20 to bundle them.
- **Migrations:** V2 migration 0013 is referenced in the user prompt as Risks & Decisions catalog source.
- **ADRs:** `docs/architecture/term-boundaries.md` (Task vs Open Item vs Decision), `docs/decisions/architecture-principles.md` (governance is first-class)
- **V2 code paths to study during /architecture and /backend:**
  - `apps/api/src/projektplattform_api/domain/core/risks/`
  - V2's planned `apps/api/src/projektplattform_api/domain/core/decisions/` and `domain/core/open_items/` (skeleton only)

## User Stories
- **As a project lead, I want to capture risks with probability, impact, mitigation, and responsible person so that risks are centrally tracked.** (Already covered by PROJ-7 F4.2 — duplicated here as a reminder for cross-cutting consistency.)
- **As a project lead, I want to document decisions with date, rationale, decider, and stakeholders involved so the project's choices are auditable.**
- **As a project lead, I want decisions to be immutable — revisions create a new linked decision — so historical truth is preserved.**
- **As a project member, I want lightweight Open Items for unclear topics that aren't yet tasks or decisions.**
- **As a project member, I want to convert an Open Item into either a Task (if a clarification path is defined) or a Decision (when the matter is decided).**

## Acceptance Criteria

### Risks (cross-link to PROJ-7's implementation)
- [ ] Single canonical `risks` table (defined in PROJ-7 — PROJ-20 reuses it).
- [ ] Risk score = `probability × impact`.
- [ ] Status: `open | mitigated | accepted | closed`.

### Decisions
- [ ] Table `decisions`: `id, tenant_id, project_id, title, decision_text, rationale, decided_at, decider_stakeholder_id (nullable FK), context_phase_id (nullable), context_risk_id (nullable), supersedes_decision_id (nullable FK self), is_revised (bool, default false), created_by, created_at`.
- [ ] **No mutating PATCH** on the body fields (`decision_text`, `rationale`, `decided_at`). Edits create a new decision with `supersedes_decision_id = old.id` and old.is_revised becomes true.
- [ ] CRUD endpoints under `/api/projects/[id]/decisions` (POST creates new; revisions also POST with `supersedes_decision_id`).
- [ ] Project room "Decisions" tab lists chronologically with revision links.
- [ ] Every decision logged in PROJ-10 audit with reason `decision_logged` or `decision_revised`.

### Open Items
- [ ] Table `open_items`: `id, tenant_id, project_id, title, description, status (open | in_clarification | closed | converted), contact (nullable text — name OR FK stakeholder), converted_to_entity_type (nullable), converted_to_entity_id (nullable), created_at, updated_at`.
- [ ] CRUD endpoints.
- [ ] Convert action: open item → task (creates a work_item with kind=task, links back) or → decision (creates a decision, marks open_item.status=converted).
- [ ] Audit on every status change.

## Edge Cases
- **Decision with no decider stakeholder** → allowed, but logged as "no decider documented" in audit; UI warns.
- **Revising a decision multiple times** → forms a chain via `supersedes_decision_id`; UI shows the lineage.
- **Open item with both task AND decision conversion attempted** → second conversion blocked; status `converted` is final.
- **Cross-tenant access** → 404 (RLS).
- **Decision attached to a deleted phase or risk** → FK SET NULL; decision text stays.
- **Bulk import of pre-existing decisions** → migration script creates the rows with backdated `decided_at` and a special audit reason `decision_imported`.
- **AI tries to write a decision automatically** → blocked. Per V2 `term-boundaries.md`, "KI kann vorschlagen: nein — Decisions werden nicht von KI getroffen." UI exposes only "Convert KI proposal to decision (with my approval)" — never an auto path.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase.
- **Multi-tenant:** `decisions`, `open_items` MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS: project members read; editor+ write.
- **Validation:** Zod schemas; immutability of decision body fields enforced at the API layer (PATCH only sets `is_revised`; new content goes via POST + `supersedes_decision_id`).
- **Auth:** Supabase Auth + project role checks.
- **Audit:** PROJ-10 logs every change including the immutability-protecting attempts.
- **Performance:** Index on `(project_id, decided_at DESC)` for the decisions list.

## Out of Scope (deferred or explicit non-goals)
- Approval workflows on decisions (governance epic later).
- KI auto-deciding (forbidden by design — V2 binding term).
- Voting on decisions.
- Linking decisions to external systems.
- Heavy-weight escalation rules.
- Overlap with compliance: a decision is NOT a compliance increment by default; PROJ-18 tags decide that explicitly.

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
