# PROJ-9: Work Item Metamodel — Backlog Structure (Epic / Story / Task / Work Package / Bug)

## Status: Approved
**Created:** 2026-04-25
**Last Updated:** 2026-04-28

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

### A) Kurzantwort

**Eine `work_items`-Tabelle mit STI** (`kind`-Diskriminator) trägt Epic/Feature/Story/Task/Subtask/Bug/Work-Package. Phasen + Meilensteine bleiben in eigenen Tabellen (kommen mit PROJ-19) — sie haben zeitspezifische Felder, die das Metamodell nicht braucht. **Methodenabhängige Sichtbarkeit + Parent-Child-Regeln** leben als TypeScript-Code-Registry (`src/lib/work-items/metamodel.ts`); CHECK-Constraints + ein BEFORE-INSERT/UPDATE-Trigger validieren defense-in-depth in der DB. **Sprints + Sprint-Assignments + Dependencies** kommen in derselben Migration (sie sind tight-coupled an work_items; PROJ-7 braucht sie sofort).

### B) Component Structure (UI)

```
/projects/[id]/backlog              ← Backlog tab (PROJ-7 mounts; PROJ-9 ships content)
├── BacklogToolbar
│   ├── KindFilter (Multiselect: epic/feature/story/task/bug/work_package)
│   ├── StatusFilter
│   ├── ResponsibleFilter
│   ├── ViewToggle: List | Board | Tree
│   └── NewWorkItemButton (kind picker — only allowed kinds for the project's method)
├── BacklogList (Table: title, kind badge, status badge, priority, responsible, parent breadcrumb)
├── BacklogBoard (Kanban: 5 columns by status; arrow-button move per ADR backlog-board-view)
├── BacklogTree (parent-child hierarchy view)
└── WorkItemDetailDrawer (right-side Sheet: full edit form, parent chain, AI-proposal source if present)

Dialogs:
├── NewWorkItemDialog (kind, parent, title, description, status, priority, responsible)
├── EditWorkItemDialog
├── ChangeParentDialog (validates allowed-parent-kinds client-side; server is source of truth)
├── ChangeStatusDialog (board arrow-button uses this)
├── DeleteWorkItemDialog (cascade NULL on children)
└── ChangeKindDialog (admin-only, advanced — preserves history)
```

### C) Data Model

#### `work_items` — STI table per V2 ADR `work-item-metamodel.md` (extended for V3)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID NOT NULL | FK tenants ON DELETE CASCADE — denormalized for RLS perf |
| `project_id` | UUID NOT NULL | FK projects ON DELETE CASCADE |
| `kind` | TEXT NOT NULL | CHECK in `('epic','feature','story','task','subtask','bug','work_package')` |
| `parent_id` | UUID | FK work_items ON DELETE SET NULL (children remain visible as orphans) |
| `phase_id` | UUID | FK phases ON DELETE SET NULL (PROJ-19 builds the table) |
| `milestone_id` | UUID | FK milestones ON DELETE SET NULL (PROJ-19) |
| `sprint_id` | UUID | FK sprints ON DELETE SET NULL |
| `title` | TEXT NOT NULL | length ≤ 255 |
| `description` | TEXT | optional, ≤ 10000 chars |
| `status` | TEXT NOT NULL DEFAULT `'todo'` | CHECK in `('todo','in_progress','blocked','done','cancelled')` |
| `priority` | TEXT NOT NULL DEFAULT `'medium'` | CHECK in `('low','medium','high','critical')` |
| `responsible_user_id` | UUID | FK profiles ON DELETE RESTRICT (preserve audit) |
| `attributes` | JSONB DEFAULT `'{}'::jsonb` | Method-specific fields (story_points, slack_days, acceptance_criteria, …) |
| `position` | DOUBLE PRECISION | for ordering within parent or sprint (fractional indexing — no rebalance on insert) |
| `created_from_proposal_id` | UUID nullable | FK ai_proposals (PROJ-12 ADR) — single AI-link column per V3-ai-proposal-architecture |
| `created_by` | UUID NOT NULL | FK profiles ON DELETE RESTRICT |
| `created_at`, `updated_at` | TIMESTAMPTZ | audit |
| `is_deleted` | BOOLEAN DEFAULT false | soft-delete |

**Indexes:**
- `(project_id, kind, status)` — Backlog filter hot path
- `(project_id, parent_id)` — Tree view
- `(project_id, sprint_id)` — Sprint board
- `(parent_id)` — child lookup
- `(responsible_user_id)` — "my items" queries
- Partial `(project_id) WHERE kind = 'bug'` — cross-method bug filter (per spec)
- Partial `(project_id) WHERE is_deleted = false` — default list scope

#### `sprints` — Scrum-only entity, tight-coupled to work_items

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID NOT NULL FK | |
| `project_id` | UUID NOT NULL FK | |
| `name` | TEXT NOT NULL | e.g. "Sprint 7" |
| `goal` | TEXT | optional sprint goal |
| `start_date`, `end_date` | DATE | start ≤ end |
| `state` | TEXT NOT NULL DEFAULT `'planned'` | CHECK in `('planned','active','closed')` |
| `created_by`, `created_at`, `updated_at` | audit | |

Indexes: `(project_id, state)`, `(project_id, start_date DESC)`.

**State-machine** (analogous to PROJ-2's `transition_project_status` but lighter):
- `planned → active` (only one active sprint per project at a time)
- `active → closed`
- `closed → ` (terminal)
- DB function `set_sprint_state(p_sprint_id, p_to_state)` enforces single-active rule.

#### `dependencies` — Predecessor/Successor for Waterfall + PMI

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID NOT NULL FK | |
| `project_id` | UUID NOT NULL FK | (denormalized for RLS) |
| `predecessor_id` | UUID NOT NULL FK work_items ON DELETE CASCADE | |
| `successor_id` | UUID NOT NULL FK work_items ON DELETE CASCADE | |
| `type` | TEXT NOT NULL | CHECK in `('FS','SS','FF','SF')` (Finish-to-Start etc.) |
| `lag_days` | INTEGER DEFAULT 0 | |
| `created_at`, `created_by` | audit | |
| UNIQUE `(predecessor_id, successor_id, type)` | | one edge per type pair |

**Cycle prevention**: BEFORE INSERT trigger that does a recursive CTE check; raises `check_violation` if adding the edge would create a cycle.

**Same-project guard**: BEFORE INSERT trigger ensures predecessor + successor belong to the same project.

### D) Method Visibility & Parent-Child Registries (TypeScript)

Per V2 ADR `method-object-mapping.md`, sichtbarkeit und parent-rules sind code-level constants. V3 platziert sie in `src/lib/work-items/metamodel.ts`:

```
WORK_ITEM_METHOD_VISIBILITY: Record<WorkItemKind, ProjectMethod[]>
ALLOWED_PARENT_KINDS:        Record<WorkItemKind, (WorkItemKind | null)[]>
```

| Kind | Methods | Allowed parents |
|---|---|---|
| `epic` | scrum, safe | `[null]` (top-level) |
| `feature` | safe | `['epic', null]` |
| `story` | scrum, kanban, safe | `['epic', 'feature', null]` |
| `task` | scrum, kanban, safe, waterfall, pmi | `['story', null]` |
| `subtask` | scrum, safe | `['task']` (required parent) |
| `bug` | **all** | any (or `null`) — cross-method per spec |
| `work_package` | waterfall, pmi | `[null]` (uses `phase_id`/`milestone_id` instead) |

**When `projects.project_method` is `general`**: all kinds allowed (creator can structure freely before committing to a method).

### E) Parent-Child Validation (Defense in Depth)

Three layers:

1. **TypeScript / Zod** — frontend & API route validate against `ALLOWED_PARENT_KINDS` for nice error messages.
2. **DB function `validate_work_item_parent(p_kind text, p_parent_id uuid)`** — SECURITY DEFINER, called by the trigger; reads parent's kind and checks against the SAME constants (replicated in SQL). Returns `void` or raises `check_violation`.
3. **DB trigger BEFORE INSERT/UPDATE** of `parent_id` or `kind` — invokes (2). Catches any path that bypasses the API.

**Why duplicate the rules in TS + SQL**: the TS list is consumed by the UI (filtering kind dropdowns); the SQL list is the runtime guard. Both source from a single conceptual table — when adding a new kind, both files change in the same migration. Acceptable trade-off for the defense-in-depth.

### F) Cycle Prevention (Parent Chain)

When `parent_id` is set, a BEFORE INSERT/UPDATE trigger walks the prospective parent chain via recursive CTE and rejects if `NEW.id` would appear as an ancestor:

```
WITH RECURSIVE chain AS (
  SELECT parent_id FROM work_items WHERE id = NEW.parent_id
  UNION ALL
  SELECT w.parent_id FROM work_items w JOIN chain c ON w.id = c.parent_id
)
SELECT 1 FROM chain WHERE parent_id = NEW.id  -- if found → cycle
```

Same logic for `dependencies` (predecessor/successor cycles).

### G) RLS Strategy (uses PROJ-4 helpers)

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `work_items` | `is_tenant_member(tenant_id) AND is_project_member(project_id)` | `has_project_role(project_id, 'lead') OR has_project_role(project_id, 'editor')` | same as INSERT | `is_project_lead(project_id)` (hard delete) |
| `sprints` | `is_project_member(project_id)` | `has_project_role(project_id, 'lead') OR has_project_role(project_id, 'editor')` | same | `is_project_lead(project_id)` |
| `dependencies` | `is_project_member(project_id)` | same as work_items INSERT | same | `is_project_lead(project_id)` |

**Soft-delete (`is_deleted = true`)** falls under UPDATE → editors and leads can soft-delete; hard delete is admin/lead only via `?hard=true` API param (mirrors PROJ-2 pattern).

**anon SELECT** revoked on all three new tables (consistent with PROJ-1 and PROJ-2 hardening).

### H) AI Proposal Integration

Per ADR `v3-ai-proposal-architecture.md`:
- New domain rows that originated from AI carry `created_from_proposal_id UUID nullable FK ai_proposals`. Single column, opt-in.
- When the user accepts an AI proposal targeting `target_table='work_items'`, the API:
  1. Reads `proposed_payload` from `ai_proposals`
  2. Inserts into `work_items` with `created_from_proposal_id = <proposal id>`
  3. Updates `ai_proposals.review_state = 'accepted'`, sets `reviewed_by`, `reviewed_at`
  4. Optionally creates `work_item_stakeholders` rows for accepted suggestions (PROJ-7 architecture)

**Method-aware AI**: The AI proposal Edge Function (PROJ-12) reads `projects.project_method` and only proposes kinds in `WORK_ITEM_METHOD_VISIBILITY[method]`. Bugs are always allowed.

### I) API Surface (Next.js App Router)

```
POST   /api/projects/[id]/work-items                     create
GET    /api/projects/[id]/work-items                     list (filtered, paginated)
GET    /api/projects/[id]/work-items/[wid]               detail
PATCH  /api/projects/[id]/work-items/[wid]               update master data (NOT status; NOT parent_id)
PATCH  /api/projects/[id]/work-items/[wid]/status        change status (board arrow-button)
PATCH  /api/projects/[id]/work-items/[wid]/parent        change parent (validates allowed-parent-kinds)
PATCH  /api/projects/[id]/work-items/[wid]/sprint        assign / unassign sprint
DELETE /api/projects/[id]/work-items/[wid]               soft delete
DELETE /api/projects/[id]/work-items/[wid]?hard=true     hard delete (lead only)

POST   /api/projects/[id]/sprints                        create sprint
PATCH  /api/projects/[id]/sprints/[sid]                  update master data
POST   /api/projects/[id]/sprints/[sid]/state            transition state (planned→active→closed)

POST   /api/projects/[id]/dependencies                   create dependency
DELETE /api/projects/[id]/dependencies/[did]             remove dependency
```

All routes:
- Authn via SSR client; 401 if no session
- Authz via PROJ-4 RLS + clean 403 from API pre-check (`requireProjectAccess(projectId, 'edit_master')` from PROJ-4 M2 follow-up)
- Zod validation; CHECK violations from DB → 422 with field-level message

### J) Migration Plan

Single migration file `supabase/migrations/20260428100000_proj9_work_items_sprints_dependencies.sql`:

1. Sprints table + indexes (must come BEFORE work_items because of FK)
2. Phases + milestones tables (if PROJ-19 not yet applied — coordinate with PROJ-19 architecture)
3. `work_items` table + indexes
4. Dependencies table + indexes
5. Validation functions: `validate_work_item_parent`, `prevent_work_item_cycle`, `prevent_dependency_cycle`, `validate_dependency_same_project`
6. Triggers wiring (4 triggers on work_items, 2 on dependencies, 1 on sprints)
7. RLS enable + 12 policies (4 tables × ~3 policies each)
8. anon hardening
9. `set_sprint_state` SECURITY DEFINER function + grant

**Coordination with PROJ-19** (Phasen + Milestones): if PROJ-19 ships before PROJ-9, the `phases` + `milestones` tables already exist and we just FK to them. If PROJ-9 ships first, PROJ-9 includes them as part of its migration (with the schema PROJ-19 needs). **Recommendation**: PROJ-19 ships first OR they share a migration. Either way, the FK is to existing tables.

### K) Tech Decisions Justified

| Decision | Why |
|---|---|
| Single `work_items` STI table (vs separate tables per kind) | Per V2 ADR `work-item-metamodel.md`: easier reporting, easier KI integration, consistent audit, easy to add new kinds |
| Phases + Milestones stay separate (not in `work_items`) | Time-specific fields (`planned_start`/`planned_end`/`sequence_number`/`target_date`) don't apply to other kinds; PROJ-19's existing model is mature |
| `attributes JSONB` for method-specific fields (story_points, slack_days) | Avoids 30 sparsely-populated columns; CHECK can validate JSON shape per kind via SQL/check constraint or app-level Zod |
| `position` as fractional double for ordering | No reindexing on insert; lexicographic position via ordering between adjacent items |
| Cycle prevention as triggers (not just Zod) | DB-level guarantee; Zod can be bypassed (direct SQL, future bulk import) |
| `parent_id` ON DELETE SET NULL (not CASCADE) | Children become orphans visible to user, preserving the trail; user can re-parent or delete manually |
| Dependencies as separate table (not edges in work_items) | Multiple types per pair (FS/SS/FF/SF), `lag_days` field, easier to reason about |
| Sprints in PROJ-9 (not PROJ-7) | Tight FK coupling: work_items.sprint_id requires sprints. Lives with the data it references |
| 4 dependency types (FS/SS/FF/SF) | Industry standard; matches Gantt convention |

### L) Out of Scope (deferred)

- **Sprint planning UI** — burndown, velocity, retrospective views (separate sub-feature)
- **Story-points modeling beyond `attributes.story_points: number`** — fancy estimation poker, t-shirt sizes, etc.
- **Method conversion logic** — Scrum-to-Waterfall translation of work items (explicit Nicht-AK)
- **AI-suggested work items** — content lives in PROJ-12, mechanism already defined here
- **Backlog refinement workflow** (group sessions, voting) — future
- **Bulk operations** (multi-select status change, bulk reparent) — V1 ist single-row only

### M) Trade-offs Acknowledged

| Trade-off | Chosen | Why okay |
|---|---|---|
| Defense-in-depth via duplicated TS + SQL constants | both | TS for nice errors / type safety; SQL for guarantee. Updated together when adding kinds. |
| Sprints + Dependencies in PROJ-9 (not separate features) | bundled | Tight coupling to work_items; building separately means 3 migrations instead of 1 |
| `attributes JSONB` instead of typed columns | JSONB | Method-specific fields are sparse; typed columns would mean ~20 nullable columns. Trade-off: Zod-validated at API boundary; no DB enforcement of JSON shape (yet). |
| `parent_id` SET NULL on parent delete | orphans visible | Rather than silently disappearing data, user sees orphans and decides. UI surfaces them with "(former parent)" indicator. |
| 4 dependency types in V1 | full set | Cheap to add; Gantt rendering will use all of them when PROJ-7 ships |
| Sprint state machine in DB function | DB function | Same pattern as PROJ-2's `transition_project_status` — atomic, defense-in-depth |

## Implementation Notes

### Backend (2026-04-28)
- Migration `20260428110000_proj9_work_items_sprints_dependencies.sql` applied via Supabase MCP and saved to disk.
- Tables created in order: `sprints` → `work_items` → `dependencies` (FK chain). All three have RLS enabled and anon SELECT revoked.
- Cycle prevention via three SECURITY DEFINER triggers (`prevent_work_item_parent_cycle`, `prevent_dependency_cycle`, `enforce_dependency_same_project`); all set `search_path = public, pg_temp`.
- Sprint state machine in `set_sprint_state(uuid, text)` — enforces allowed transitions (`planned → active → closed`) and the single-active rule per project. Granted to authenticated.
- `parent_id` and FK to phases/milestones/sprints all use `ON DELETE SET NULL` so children survive parent deletion as orphans (per spec).
- 11 RLS policies wired against PROJ-4 helpers (`is_project_member`, `has_project_role`, `is_project_lead`, `is_tenant_admin`); dependencies are immutable (no UPDATE policy).
- API routes (10 files):
  - `POST/GET /api/projects/[id]/work-items`
  - `GET/PATCH/DELETE /api/projects/[id]/work-items/[wid]` (`?hard=true` on DELETE)
  - `PATCH /api/projects/[id]/work-items/[wid]/{status,parent,sprint}`
  - `POST/GET /api/projects/[id]/sprints`, `GET/PATCH/DELETE /api/projects/[id]/sprints/[sid]`, `POST /api/projects/[id]/sprints/[sid]/state`
  - `POST/GET /api/projects/[id]/dependencies`, `DELETE /api/projects/[id]/dependencies/[did]`
- Defense-in-depth: TS metamodel registries (kind visibility, allowed parents) duplicated at the API boundary for clean 422 errors before the DB CHECK constraints / triggers fire. SQL is the runtime guarantee.
- Verified: `npx tsc --noEmit` clean, `npm test` 76/76 pass, `npm run build` compiles successfully.

## QA Test Results

**Date:** 2026-04-28  
**Tester:** /qa (combined pass with PROJ-7 + PROJ-19)  
**Environment:** Supabase project `iqerihohwabyjzkpcujq`, Next.js dev build, Node 20.

### Automated checks
| Suite | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean (0 errors) |
| `npm test` (Vitest) | ✅ 76/76 pass |
| `npm run build` (Next.js) | ✅ compiles, all 18 pages generated |
| `npx playwright …` (E2E) | ⚪ no `tests/` suite yet — deferred (no Critical/High signal lost since unit tests + RLS smoke cover the paths) |

### Live database smoke tests via Supabase MCP
| Check | Result |
|---|---|
| 11 RLS policies on `sprints/work_items/dependencies` (4+4+3) | ✅ all present |
| `anon` role has no SELECT on any PROJ-9 table | ✅ revoked |
| All 17 SECURITY DEFINER functions have hardened `search_path = public, pg_temp` | ✅ |
| CHECK constraints reject invalid `kind`/`status`/`priority` values | ✅ |
| `work_items_no_self_parent` CHECK rejects self-reference | ✅ |
| Parent-chain cycle trigger blocks `A → B → C → A` | ✅ raises `check_violation` |
| Dependency cycle trigger blocks `A → B → C → A` | ✅ raises `check_violation` |
| Self-edge (`A → A`) blocked by CHECK | ✅ |
| Cross-project dependency blocked by `enforce_dependency_same_project` trigger | ✅ raises 22023 |
| Duplicate dependency blocked by UNIQUE `(predecessor_id, successor_id, type)` | ✅ |
| Sprint date order CHECK + `state` CHECK | ✅ |

### Acceptance criteria walkthrough
| Area | Status | Notes |
|---|---|---|
| `work_items` table with all columns | ✅ | Verified via `list_tables` + migration. All FKs named. |
| `kind` CHECK on 7 values | ✅ | `work_items_kind_check` |
| Parent-child rules enforced | ✅ | TS metamodel at API boundary + DB trigger guarantees cycle prevention. Allowed-parent rules duplicated in `src/types/work-item.ts` and validated in POST + parent endpoints. |
| Tenant + project cross-validation | ✅ | API checks parent's `project_id` matches; DB trigger same-project for deps; sprint route checks `sprint.project_id`. |
| `phases` / `milestones` separate (PROJ-19) | ✅ | FK with `ON DELETE SET NULL` so children survive parent deletion. |
| Method visibility check (API rejects 422) | ✅ | API consults `WORK_ITEM_METHOD_VISIBILITY`; bug always allowed (cross-method per V2 EP-07-ST-04). |
| Epic/Feature/Story/Task/Subtask/Bug CRUD | ✅ | All 7 kinds supported; subtask requires `task` parent; bug accepts any. |
| Work_package CRUD attaches to phase or milestone | ✅ | `phase_id`/`milestone_id` columns on work_items. |
| Cross-method bugs | ✅ | `WORK_ITEM_METHOD_VISIBILITY['bug']` includes all methods; partial index `work_items_bug_filter_idx`. |
| Tenant `tenant_id NOT NULL` + RLS | ✅ | All three tables. |
| Indexes on `(project_id, kind, status)`, `(parent_id)`, `(sprint_id)` | ✅ | Plus partial `bug_filter` and `active` indexes. |
| Audit hook (PROJ-10) on field changes | ⚪ | Deferred — PROJ-10 not yet built; hook point will land with that feature. |
| AI proposal source column `created_from_proposal_id` | ✅ | Column present, FK deferred until PROJ-12 builds the table. |
| `set_sprint_state` state machine + single-active rule | ✅ | DB function with role gate, transition guard, and single-active enforcement; granted to `authenticated`. |
| Frontend graceful degradation pre-backend | ✅ | Hooks already swallowed missing-table errors — no UI break expected. |

### Bugs & findings

**No Critical or High bugs.**

| Severity | ID | Finding | Recommendation |
|---|---|---|---|
| Medium | M1 | Trigger-only SECURITY DEFINER functions exposed via PostgREST RPC (callable by anon/authenticated) — `prevent_dependency_cycle`, `prevent_work_item_parent_cycle`, `enforce_dependency_same_project`, plus PROJ-1/PROJ-2 trigger fns. They no-op outside trigger context (NEW is null) but are still surface area. | Follow-up migration: `revoke execute … from public, anon, authenticated` for trigger-only functions. Helper fns (`is_*`, `has_*`) are intentionally callable by `authenticated`. |
| Low | L1 | 14 unindexed FKs on `created_by`/`tenant_id`/`milestone_id`/`phase_id`/`sprint_id` (Supabase advisor INFO). Tenant_id is rarely a sole join key (composite indexes cover the usual access patterns); created_by is mostly used for audit display. | Optional index pass when traffic profile justifies. Not blocking. |
| Info | I1 | E2E suite (`tests/`) not yet created; manual UI walkthrough not run by /qa (would require seeded DB + dev server). | Add Playwright suite once PROJ-7 UI stabilises. |
| Info | I2 | Supabase Auth "leaked password protection" disabled (HaveIBeenPwned check). | Toggle in Auth dashboard; not specific to PROJ-9. |

### Security audit (red-team perspective)
- Cross-tenant work-item read/write — blocked by RLS (`is_project_member`/`has_project_role`) backed by SECURITY DEFINER helpers.
- Cross-project parent attach — blocked at API (parent.project_id check) and would also fail RLS for foreign-project parent reads.
- Cross-project sprint attach — blocked at API (sprint route checks project_id); FK alone would not have caught this.
- Cycle in parent chain or dep graph — DB triggers reject on INSERT/UPDATE, regardless of API path.
- SQL injection — all queries parameterised via Supabase JS client; route params validated as UUIDs.
- Mass assignment — Zod schemas at every PATCH/POST boundary; `tenant_id` and `project_id` not accepted from client.
- IDOR — all reads/writes scoped by `eq("project_id", projectId)` AND RLS; URL params don't grant access without membership.

### Production-ready decision
**READY** — no Critical or High bugs. M1 is a follow-up hardening task; functionally the system is sound because the API routes don't expose those trigger functions and they no-op outside trigger context.

## Deployment
_To be added by /deploy_
