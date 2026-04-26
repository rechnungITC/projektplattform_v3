# PROJ-19: Phases & Milestones — Cross-cutting Schedule Backbone

## Status: Planned
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
Phases (with `planned_start`, `planned_end`, `sequence_number`, `status`) and Milestones (with `target_date`, optional phase association) as the schedule backbone for waterfall/PMI projects and as the structural skeleton other modules hang on (work_packages, compliance phase-gate, Gantt). V2 already had these as separate tables; V3 ships them here as a dedicated PROJ so the data model and CRUD lifecycle are explicit and not implicit inside PROJ-9 or PROJ-7.

## Dependencies
- Requires: PROJ-2 (Project CRUD)
- Requires: PROJ-4 (Project memberships for RBAC)
- Requires: PROJ-10 (Audit)
- Influences: PROJ-7 (Project Room — Planning/Gantt tab reads phases/milestones), PROJ-9 (work_packages link to phase/milestone), PROJ-18 (phase-gate check)

## V2 Reference Material
- **Epic file:** N/A — V2 has phases/milestones implemented in Sprint 2 but not as a single epic file. Closest reference: V2 epics EP-05 (project room), EP-07 (work item metamodel), and EP-09 (resources).
- **Migrations:** `db/migrations/versions/0003_phases.py`, `0004_milestones.py` in V2 (the V3 user prompt explicitly mentions `0003` for Phases & Milestones).
- **ADRs:** `docs/decisions/work-item-metamodel.md` (decided phases/milestones stay separate from work_items), `docs/decisions/master-data-editing.md`
- **V2 code paths to study during /architecture and /backend:**
  - `apps/api/src/projektplattform_api/domain/core/phases/models.py`
  - `apps/api/src/projektplattform_api/domain/core/milestones/models.py`
  - `apps/api/src/projektplattform_api/routers/phases.py`, `milestones.py`
  - `apps/web/app/projects/[id]/components/PhasesTimeline/`

## User Stories
- **As a project lead in a waterfall/PMI project, I want to define phases with start/end dates and sequence so that the project follows a structured timeline.**
- **As a project lead, I want milestones with target dates that can attach to a phase so important control points are captured.**
- **As a project lead, I want to mark phase status (`planned` → `in_progress` → `completed` or `cancelled`) so progress is visible.**
- **As a project member, I want to copy a phase or milestone so I can reuse structure.**
- **As a project member, I want phase/milestone changes audited so I can trace what changed and undo errors.**

## Acceptance Criteria

### Phases
- [ ] Table `phases`: `id, tenant_id, project_id, name, description (nullable), planned_start (date, nullable), planned_end (date, nullable), actual_start (date, nullable), actual_end (date, nullable), sequence_number (int), status (planned|in_progress|completed|cancelled), created_at, updated_at, is_deleted`.
- [ ] CRUD endpoints under `/api/projects/[id]/phases`.
- [ ] Sequence enforced unique per project; reordering API.
- [ ] Status transitions allowed: `planned → in_progress → completed` and any → `cancelled`.
- [ ] On `status=completed`, hook PROJ-18's compliance-gate check.

### Milestones
- [ ] Table `milestones`: `id, tenant_id, project_id, phase_id (nullable FK phases), name, description (nullable), target_date (date), actual_date (date, nullable), status (planned|achieved|missed|cancelled), created_at, updated_at, is_deleted`.
- [ ] CRUD endpoints.
- [ ] Filter milestones by phase, by status.
- [ ] Overdue computation (target_date < today AND status='planned') drives the project health (PROJ-7).

### RBAC + audit
- [ ] All CRUD requires project membership; editor+ for write.
- [ ] All edits audited (PROJ-10).
- [ ] Tenant + project RLS.

### Copy
- [ ] Copy phase or milestone (PROJ-10's copy mechanism).
- [ ] Copy preserves structure but resets dates and assignments (per PROJ-10 copy rules).

## Edge Cases
- **`planned_end < planned_start`** → 422 validation error.
- **Two phases with the same `sequence_number`** → unique constraint blocks; reordering reassigns.
- **Milestone whose phase was deleted** → `phase_id` set NULL (FK ON DELETE SET NULL).
- **Phase deleted with attached work_packages (PROJ-9)** → blocked unless `force=true`; with force, work_packages set `phase_id=NULL`.
- **Cross-tenant access** → 404 (RLS).
- **Status change from `completed` back to `in_progress`** → allowed but flagged with audit note (compensates for re-opens).
- **Overdue milestone** → reflected in project health automatically (no manual flag).

## Technical Requirements
- **Stack:** Next.js 16 + Supabase, shadcn/ui (`Form`, `Table`, `DatePicker`, `Tabs`, `Card`).
- **Multi-tenant:** Both tables MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS combines tenant + project membership.
- **Validation:** Zod (date ordering, sequence number uint, status enum).
- **Auth:** Supabase Auth + project role checks.
- **Audit:** PROJ-10 hooks on every mutation.
- **Performance:** Index on `(project_id, sequence_number)` and `(project_id, target_date)`.

## Out of Scope (deferred or explicit non-goals)
- Approval gates on phases (governance epic).
- Critical-path computation (deferred to PROJ-7 Gantt enhancements).
- Auto-shift of dependent items when a phase moves.
- Phase templates (covered by PROJ-18 compliance templates and PROJ-6 starter structures).

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
