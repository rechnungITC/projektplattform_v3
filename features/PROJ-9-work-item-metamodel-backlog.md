# PROJ-9: Work Item Metamodel — Backlog Structure (Epic / Story / Task / Work Package / Bug)

## Status: Planned
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
Introduces the unified planning-object metamodel: one `work_items` table with a `kind` discriminator (`epic | feature | story | task | subtask | bug | work_package`), parent-child rules per kind, method-aware visibility, and integration with the already-existing phases/milestones (which stay in their own tables). Bugs are cross-method. Inherits V2 EP-07.

## Dependencies
- Requires: PROJ-2 (Project CRUD)
- Requires: PROJ-4 (Project memberships for RBAC)
- Requires: PROJ-6 (Method catalog and `WORK_ITEM_METHOD_VISIBILITY`)
- Influences: PROJ-7 (Backlog/Board), PROJ-10 (Audit), PROJ-12 (KI suggestions target work items), PROJ-14 (Jira export)

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-07-methodenobjekte-und-backlog.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-07.md` (ST-01 metamodel, ST-02 Scrum objects, ST-03 classical phase/milestone/work-package, ST-04 cross-method bugs)
- **ADRs:** `docs/decisions/work-item-metamodel.md`, `docs/decisions/method-object-mapping.md`, `docs/decisions/metamodel-infra-followups.md`
- **V2 code paths to study during /architecture and /backend:**
  - `apps/api/src/projektplattform_api/domain/core/work_items/models.py` — STI table + kind enum
  - `apps/api/src/projektplattform_api/domain/core/work_items/metamodel.py` — `WORK_ITEM_METHOD_VISIBILITY`, `ALLOWED_PARENT_KINDS`
  - `apps/api/src/projektplattform_api/routers/work_items.py` — CRUD + method check
  - `db/migrations/versions/0009_work_items.py`

## User Stories
- **[V2 EP-07-ST-01]** As the product team, we want a shared metamodel for planning objects so all methods are technically consistent.
- **[V2 EP-07-ST-02]** As a user, I want to create and link Scrum objects (Epic, Story, Task, Subtask, Bug) so that I can run agile projects internally.
- **[V2 EP-07-ST-03]** As a user, I want classical phase/milestone/work-package objects so that waterfall and PMI-style projects are structurable.
- **[V2 EP-07-ST-04]** As a user, I want bugs to work across all methods so that defects are consistently tracked.

## Acceptance Criteria

### Metamodel
- [ ] Table `work_items` with: `id, tenant_id, project_id, kind, parent_id (nullable FK self), phase_id (nullable FK phases), milestone_id (nullable FK milestones), sprint_id (nullable FK sprints), title, description, status (todo|in_progress|blocked|done|cancelled), priority (low|medium|high|critical), responsible_user_id (nullable FK auth.users), created_by, created_at, updated_at, is_deleted`.
- [ ] `kind` column has CHECK constraint over the enum.
- [ ] Parent-child rules enforced server-side: epic→None; feature→epic|None; story→epic|feature|None; task→story|None; subtask→task; bug→any|None; work_package→None (uses phase_id/milestone_id instead).
- [ ] Tenant + project cross-validation: parent must be in the same project.
- [ ] `phases` and `milestones` stay as separate tables (already in V3 from PROJ-2's lifecycle? — verify; if not, this PROJ creates them too).
- [ ] Method visibility check: when `projects.method` is set, creating a kind not in `WORK_ITEM_METHOD_VISIBILITY[method]` is rejected with 422 — bugs always allowed.

### Scrum objects
- [ ] Epic CRUD; Story CRUD with optional epic parent; Task CRUD with optional story parent; Subtask CRUD requiring task parent; Bug CRUD with optional any parent.
- [ ] Detail view shows the parent chain.
- [ ] List view groups by parent and supports filtering by kind.

### Classical objects
- [ ] Phase CRUD with `planned_start`, `planned_end`, `sequence_number`, `status`.
- [ ] Milestone CRUD with `target_date`, optional phase association.
- [ ] Work_package CRUD attached to a phase or milestone, with `planned_start`, `planned_end`.
- [ ] Tree view in Planning tab showing phase → milestone → work_package hierarchy.

### Cross-method bugs
- [ ] Bug always allowed regardless of `projects.method`.
- [ ] Bug can attach to any kind via `parent_id` or stand alone.
- [ ] Filter "Bugs in this project" works on Backlog tab in any method.

### Tenant + RLS
- [ ] All new tables have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`.
- [ ] RLS: `is_tenant_member(tenant_id) AND is_project_member(project_id)`.
- [ ] Indexes on `(project_id, kind, status)`, `(parent_id)`, `(sprint_id)`.

## Edge Cases
- **Subtask without a parent task** → 422 at creation, 422 at PATCH that would orphan it.
- **Cycle in parent chain** (A → B → A) → blocked at INSERT/PATCH via a CTE check.
- **Method changed after work items exist** → existing kinds remain; UI hides kinds no longer visible (per V2 ADR `method-object-mapping.md`).
- **Cross-tenant parent reference** → 404.
- **Deleting a parent** → child `parent_id` set to NULL (cascade NULL), not cascade delete (children should be visible as orphans for review).
- **Bug attached to a deleted parent** → same: `parent_id` becomes NULL.
- **Epic deleted in Scrum project** → all child stories/tasks have `parent_id` set to NULL (or to the epic's parent if any).

## Technical Requirements
- **Stack:** Next.js 16 + Supabase, shadcn/ui (`DataTable`, `Form`, `Tree` from a recipe, `Tabs`).
- **Multi-tenant:** Strictly enforced via `tenant_id NOT NULL` and RLS on every operation.
- **Validation:** Zod schemas + server-side parent-rule enforcement (DB trigger + API check, defense in depth).
- **Auth:** Project role check from PROJ-4 (`project_editor`/`project_lead` for writes; `project_viewer`+ for reads).
- **Performance:** Index on `(project_id, kind, status)`; consider partial indexes for `kind='bug'` filter.
- **Audit:** Hook into PROJ-10 audit so every field-level change is captured for the canonical fields (title, description, status, priority, responsible_user_id, parent_id).

## Out of Scope (deferred or explicit non-goals)
- UI for sprint planning (burndown/velocity).
- Story-points modeling beyond a freeform integer field.
- Method conversion logic (Scrum → Waterfall translates work items).
- KI-suggested work items (PROJ-12).

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
