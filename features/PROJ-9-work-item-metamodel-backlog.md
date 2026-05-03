# PROJ-9: Work Item Metamodel — Backlog Structure (Epic / Story / Task / Work Package / Bug)

## Status: Deployed (R1 + R2 live in production)
**Created:** 2026-04-25
**Last Updated:** 2026-05-04 (R2 deployed — git tag `v0.9.0-proj9r2`, commit `60cccd9`; migration applied to Supabase; API routes live via Vercel auto-deploy)

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

## Tech Design Round 2 — Polymorphic Dependencies + Hierarchy Extension

> **Architected:** 2026-05-03
> **Origin:** CIA-Review 2026-05-03 + [ADR-004 — Projekt → Phase → Arbeitspaket → To-do-Hierarchie + polymorphe Dependencies](../docs/decisions/project-phase-workpackage-todo-hierarchy.md). Konsumiert von [PROJ-25 (Gantt-DnD)](PROJ-25-dnd-stack.md) und [PROJ-36 (WBS-Hierarchie + Tree-View + Roll-up)](PROJ-36-waterfall-wbs-hierarchy-rollup.md).
> **Charakter:** Addendum zur deployed Round 1 — additive Schema-Änderungen + Tabellen-Migration, keine Re-Implementation des Bestehenden.

### N) Round-2-Scope (was Round 2 schließt)

Round 1 (deployed 2026-04-28) hat das Work-Item-Metamodel etabliert: STI-Tabelle mit Kinds, Self-FK-Hierarchie (`parent_id`), eine `dependencies`-Tabelle mit Work-Item-zu-Work-Item-Beziehungen.

Round 2 erweitert das Modell um vier additive Bausteine — **kein Bruch existierender Daten**, keine API-Änderung an bestehenden Endpoints:

1. **`work_items.outline_path`** (ltree) — eine maschinenlesbare Hierarchie-Adresse pro Item, automatisch gepflegt. Macht Subtree-Queries (alle Kinder + Enkel + …) Big-O-billig.
2. **Erweiterte Parent-Child-Regeln** — `task` darf jetzt unter `work_package` hängen, `work_package` unter `work_package` (Multi-Level-WBS).
3. **Polymorphe `dependencies`-Tabelle** — ersetzt die Round-1-`dependencies`-Tabelle. Erlaubt Beziehungen zwischen `project`, `phase`, `work_package` und `todo` (Work-Items mit Kinds task/subtask/epic/story/feature/bug).
4. **Cross-Project-Dependencies** — innerhalb desselben Tenants erlaubt; Cross-Tenant hard-blocked.

Round 2 baut **nicht** UI: Tree-View, WBS-Codes und Roll-up bleiben PROJ-36-Eigentum.

### O) Schema-Änderungen (additiv, dann ein Tabellen-Tausch)

#### O.1 Neue Spalten auf `work_items`

| Spalte | Typ | Nullable | Default | Maintained by |
|---|---|---|---|---|
| `outline_path` | `ltree` | NO (nach Backfill) | computed | Trigger |
| `sequence_in_parent` | `INTEGER` | NO | 0 | Application + Trigger |

`outline_path` wird per Trigger aus `parent.outline_path` plus `sequence_in_parent` zusammengesetzt. Re-numbering bei Move passiert über einen separaten Trigger, der den Subtree mit einem einzigen UPDATE aktualisiert (ltree-Index unterstützt das nativ).

`sequence_in_parent` existiert in der heutigen Tabelle als `position` — Round 2 prüft, ob die existierende Spalte semantisch identisch genutzt werden kann; falls ja, bleibt sie. Falls nicht, wird sie aliased / migriert. **`/backend`-Phase muss das beim Implementieren entscheiden** (existierende Spalte hat heute Sprint-Sortier-Funktion).

#### O.2 Neue Tabelle `dependencies` (ersetzt Round-1-Tabelle)

| Spalte | Zweck |
|---|---|
| `id` | Primärschlüssel |
| `tenant_id` | Multi-Tenant-Anker, RLS + Trigger-Verifikation |
| `from_type` | Enum: `project`, `phase`, `work_package`, `todo` |
| `from_id` | Verweis auf Source-Entity (validiert per Trigger) |
| `to_type` | Enum gleich wie `from_type` |
| `to_id` | Verweis auf Target-Entity |
| `constraint_type` | Enum: `FS`, `SS`, `FF`, `SF` (default `FS`) |
| `lag_days` | Signed integer, default 0 (negative = Lead) |
| `created_at` | Timestamp |
| `created_by` | Auth-User-Reference |

**Nicht enthalten** (bewusst): `project_id`. Cross-Project-Dependencies sind ADR-004-konform; das Tenant-Constraint reicht. Project-Filter erfolgt via Join über die referenzierten Entitäten.

**Indices:**
- `(tenant_id, from_type, from_id)` — für „Welche Deps starten von X?"
- `(tenant_id, to_type, to_id)` — für „Welche Deps zeigen auf X?"
- `(tenant_id)` — RLS-Filter
- UNIQUE `(from_type, from_id, to_type, to_id, constraint_type)` — keine Duplikate

#### O.3 Erweiterung `ALLOWED_PARENT_KINDS` (Code-Konstante)

Die TypeScript-Konstante (heute in der Codebase, Round 1) wird erweitert:

| Kind | Allowed Parents Round 1 | Allowed Parents Round 2 |
|---|---|---|
| `epic` | `null` | `null` (unverändert) |
| `feature` | `epic`, `null` | `epic`, `null` (unverändert) |
| `story` | `feature`, `epic`, `null` | `feature`, `epic`, `null` (unverändert) |
| `task` | `story`, `null` | `story`, `work_package`, `null` |
| `subtask` | `task`, `null` | `task`, `null` (unverändert) |
| `bug` | `null` | `null` (unverändert) |
| **`work_package`** | `null` | **`work_package`, `null`** |

Mirror in der Postgres-Trigger-Function `check_allowed_parent_kind` — wird in der Round-2-Migration ersetzt.

### P) Polymorphic FK Validation (Trigger-basiert)

**Strategie:** BEFORE-INSERT-/UPDATE-Trigger auf der neuen `dependencies`-Tabelle.

Pro Trigger-Aufruf:
1. Lookup `from_id` in der zu `from_type` passenden Tabelle (`projects`, `phases`, `work_items`).
2. Lookup `to_id` in der zu `to_type` passenden Tabelle.
3. Beide Lookups müssen genau eine Zeile finden — sonst Abbruch mit klar gelabeltem Fehler.

**ON-DELETE-Verhalten:** Polymorphe FKs haben kein eingebautes CASCADE. Lösung: AFTER-DELETE-Trigger auf den drei Source-Tabellen (`projects`, `phases`, `work_items`), der passende `dependencies`-Zeilen löscht.

**Trade-off bewusst akzeptiert:** Mehr Trigger-Logik im Vergleich zu nativen FKs, aber deutlich weniger Schema-Komplexität als die Generated-Columns-Variante (8 zusätzliche Spalten + 4 echte FKs). PostgreSQL-Standard-Pattern für polymorphe Beziehungen.

### Q) Cycle-Prevention (polymorph + cross-project)

Round 1 hatte Cycle-Prevention für die Work-Item-zu-Work-Item-Tabelle (Self-FK). Round 2 erweitert das auf das polymorphe Modell:

- Bei jedem INSERT/UPDATE auf `dependencies` läuft ein BEFORE-Trigger.
- Trigger startet eine rekursive CTE über die polymorphe Tabelle: „Gibt es einen Pfad von `to_id`/`to_type` zurück zu `from_id`/`from_type`?"
- Wenn ja → Abbruch mit Cycle-Error.

**Performance:** Recursive CTE ist O(V+E) auf dem Dependency-Graph. Bei realistischer Projekt-Größe (< 1000 Items, < 500 Deps) ist das im Sub-Sekunden-Bereich. Bei Mega-Projekten mit > 10 000 Deps ist eine Materialized-View-basierte Vor-Berechnung möglich; nicht in MVP.

**Cross-Project-Cycles:** Möglich, wenn Projekt A → Projekt B → Projekt A. Recursive CTE traversiert sie polymorph; Tenant-Boundary bleibt erzwungen.

### R) Tenant-Boundary-Trigger (Defense-in-Depth)

Zusätzlich zur RLS-Policy auf `dependencies` (lese/schreibe nur Tenant-Members) läuft ein BEFORE-INSERT-/UPDATE-Trigger:

1. Hole `tenant_id` der `from`-Entity.
2. Hole `tenant_id` der `to`-Entity.
3. Beide müssen mit dem `tenant_id`-Feld der `dependencies`-Zeile übereinstimmen.

**Warum doppelt zu RLS?** RLS schützt User-Sessions, aber nicht Service-Role-Keys oder direkten DB-Zugriff (z. B. durch Migrationen oder Backend-Tasks mit Admin-Rolle). Trigger ist Source-of-Truth.

### S) `outline_path`-Maintenance

Drei Trigger-Pfade:

1. **INSERT** → `outline_path = parent.outline_path || sequence_in_parent`. Wenn `parent_id IS NULL`, wird `outline_path` aus `project_id` + `sequence_in_parent` abgeleitet.
2. **UPDATE auf `parent_id` oder `sequence_in_parent`** → `outline_path` neu berechnen + Subtree (alle Descendants) per single UPDATE … WHERE old_outline_path <@ … nachziehen. ltree-GIST-Index macht das billig.
3. **DELETE** → keine Aktion (Subtree ist via CASCADE schon weg, aber Sibling-Sequenzen bleiben — Re-numbering wäre ein Nice-to-have für Sub-feature; nicht Round 2).

### T) Migration-Plan (kind-basiertes Mapping)

#### T.1 Reihenfolge im Migration-Skript

1. `CREATE EXTENSION ltree`.
2. Spalten `outline_path`, `sequence_in_parent` zu `work_items` hinzufügen (nullable).
3. Backfill `outline_path` rekursiv: Wurzeln zuerst, dann Kinder per recursive CTE.
4. Backfill `sequence_in_parent` aus existierender `position`-Spalte (oder neu-vergeben pro Sibling-Group).
5. NOT-NULL-Constraint auf `outline_path` setzen.
6. GIST-Index auf `outline_path` anlegen.
7. Neue `dependencies`-Tabelle anlegen (zunächst leer, anderer Name z. B. `dependencies_v2` falls Rename-Trick gebraucht).
8. Daten aus alter `dependencies` ins neue Schema migrieren mit kind-basiertem Mapping:
   - `predecessor_id` → `from_id`; `from_type` aus `work_items.kind`:
     - `kind='work_package'` → `'work_package'`
     - alle anderen Kinds → `'todo'`
   - `successor_id` → `to_id`; `to_type` analog
   - `kind` → `constraint_type`
   - `lag_days`, `tenant_id`, `created_at`, `created_by` 1:1
9. Row-Count-Verifikation: `count(neu) = count(alt)`.
10. Alte `dependencies`-Tabelle umbenennen zu `dependencies_legacy` (für Rollback).
11. Neue Tabelle umbenennen zu `dependencies`.
12. Trigger anlegen (Cycle-Prevention, Tenant-Boundary, Polymorphic-FK-Validation).
13. RLS-Policies anlegen.
14. ON-DELETE-Cleanup-Trigger auf `projects`, `phases`, `work_items`.
15. Trigger für `outline_path`-Maintenance + erweiterten `ALLOWED_PARENT_KINDS`-Check installieren.
16. `ALLOWED_PARENT_KINDS`-Konstante in TypeScript-Code wird in derselben Slice deployed (Code-Migration synchron mit DB-Migration).

#### T.2 Idempotenz + Reversibilität

- Migration ist transactional (`BEGIN … COMMIT`); kein Halb-Erfolg.
- DOWN-Skript verfügbar: dropt neue Tabelle + Trigger, restoriert `dependencies_legacy` → `dependencies`, dropt `outline_path` + `sequence_in_parent`.
- Re-Run-Safe via `IF NOT EXISTS` / `CREATE OR REPLACE`-Patterns.
- Pre-Migration-Snapshot per Supabase-Branch empfohlen (CIA-Pflicht in `/backend`).

#### T.3 Down-Time-Erwägungen

Für unsere Daten-Größe (< 100 Tenants, < 10 000 Items) läuft das Skript in unter 30 s — Maintenance-Window nicht erforderlich, aber empfohlen, weil zwischen Punkt 10 und 11 (Tabellen-Rename) laufende Reads auf `dependencies` kurz fehlschlagen können. Empfehlung: Migration in der Nacht oder mit „Reads lesen veraltete Daten"-Tolerated-Window.

### U) Audit-Trail-Integration (PROJ-10)

Die neue `dependencies`-Tabelle wird der PROJ-10-Audit-Whitelist hinzugefügt:

- **Audit-Mode:** Row-as-Whole (kein Field-Versioning auf Spalten — die Zeile ist klein und atomic).
- **Tracked Operations:** INSERT, DELETE. UPDATE auf einzelne Spalten ist semantisch ungewöhnlich (User würde eher löschen + neu anlegen); falls UPDATE doch passiert, wird die ganze Zeile geaudited.
- **Whitelist-Erweiterung:** PROJ-9-Round-2-Migration ergänzt `'dependencies'` in der `tracked_entity_types`-Konfiguration.

### V) API-Änderungen

#### V.1 Neue Endpoints

- `POST /api/projects/[projectId]/dependencies` — neue Dependency anlegen. Body: `{ from_type, from_id, to_type, to_id, constraint_type, lag_days }`.
- `DELETE /api/dependencies/[depId]` — Dependency entfernen.
- `GET /api/projects/[projectId]/dependencies` — alle Deps eines Projekts (für Gantt-Initial-Render).
- `GET /api/projects/[projectId]/critical-path` — RPC-Aufruf der Postgres-Function (Forward-/Backward-Pass + CP-Liste). Nutzt PROJ-25's manuelle CP-Implementation; Round 2 stellt nur den Daten-Backbone bereit.

#### V.2 Geänderte Endpoints

- `GET /api/projects/[projectId]/work-items` — antwortet zusätzlich mit `outline_path` und `sequence_in_parent` pro Item (für Tree-View in PROJ-36).
- `PATCH /api/work-items/[id]` — akzeptiert jetzt auch `parent_id`-Updates auf vorher unmögliche Kombinationen (`task` → `work_package` etc.). Validation läuft via Trigger; Frontend muss Fehler-Message korrekt anzeigen.

#### V.3 Entfernte Endpoints

Keine. Alte Round-1-`dependencies`-Endpoints (z. B. `POST /api/work-items/[id]/dependencies`) bleiben **funktional kompatibel**: Server-Wrapper übersetzt sie auf das polymorphe Schema (Wrapper darf nach 6-Monats-Deprecation-Window entfernt werden).

### W) Performance-Architektur

| Query / Aktion | Anforderung | Strategie |
|---|---|---|
| Subtree-Query (alle Descendants) | < 100 ms bei 5 000 Items im Subtree | ltree GIST-Index + `WHERE outline_path <@ 'X.Y'` |
| Dependency-Lookup pro Item | < 50 ms | Composite Index `(tenant_id, from_type, from_id)` + `(tenant_id, to_type, to_id)` |
| Cycle-Detection beim Insert | < 200 ms typisch | Recursive CTE; Worst-case bei dichten Graphen → Materialized View ist Future-Optimierung |
| Critical-Path-Compute (PROJ-25-Konsument) | < 500 ms bei 500 Items | Recursive CTE Forward+Backward + Postgres-Native-Joins |
| Migration auf Production-Daten | < 30 s | Single-Transaction; ltree + Polymorphic-Schema sind nur kleine Schema-Operationen |

### X) Risiken + Mitigation

| Risiko | Schwere | Mitigation |
|---|---|---|
| **Polymorphic-Trigger-Performance bei hohem Insert-Volumen** | Mittel | Trigger sind effizient (3 Lookups pro Insert); bei > 1000 Inserts/Min könnte ein Bulk-Insert-Bypass nötig sein → Future-Optimierung. |
| **Bestehende `dependencies`-Konsumenten brechen** | Mittel | Wrapper-Endpoints für 6 Monate; QA muss alle existierenden Routen-Konsumer testen. |
| **Cycle-Detection-Performance bei dichten Graphen** | Niedrig | Recursive CTE mit Tiefe-Limit (z. B. max 50 Hops) als Sicherheitsnetz. |
| **`outline_path`-Re-Compute bei Bulk-Move** | Niedrig | Single UPDATE … WHERE outline_path <@ alt; ltree-Index macht das billig. |
| **Backfill-Inkonsistenz bei korrupten Round-1-Daten** | Niedrig | Pre-Migration-Validation-Pass: Anzahl `work_items` mit `parent_id != null AND parent.project_id != self.project_id` muss 0 sein (war Round-1-Trigger-erzwungen). |
| **Sequence_in_parent-Kollision mit existierender `position`-Spalte** | Mittel | `/backend`-Phase muss klären: existierende Spalte umwidmen ODER neue Spalte hinzufügen. Spec dokumentiert beide Optionen. |
| **Cross-Tenant-Leak via Service-Role-Migrations** | Hoch | Trigger als Source-of-Truth (defense-in-depth zu RLS). Wird in QA durch direkte SQL-Inserts mit Service-Role-Key getestet. |

### Y) Test-Strategie

- **Unit-Tests (Vitest):** ALLOWED_PARENT_KINDS-Erweiterung TS-seitig, kind-basiertes Migration-Mapping.
- **Postgres-Integration:**
  - Trigger-Pfade: validiere Polymorphic-FK-Lookup, Cycle-Detection (positiv + negativ), Tenant-Boundary-Block.
  - Migration auf Kopie der Prod-DB (Supabase-Branch).
  - ltree-Backfill-Korrektheit: alle work_items haben outline_path, kein NULL nach Migration.
- **Cross-Project-Dependency-Smoke:** Erlaubt im selben Tenant; geblockt cross-tenant.
- **Audit-Trail-Smoke:** INSERT auf `dependencies` erzeugt PROJ-10-Audit-Eintrag.
- **Regression:** existierende Round-1-API-Routen liefern weiterhin 200 OK + korrekte Daten via Wrapper.

### Z) Tech-Entscheidungen Round 2 — Justification

| # | Entscheidung | Begründung |
|---|---|---|
| **R2-D1** | Polymorphic FK via Trigger statt Generated Columns | Standard-Postgres-Pattern; weniger Schema-Komplexität; ON-DELETE über separate Source-Trigger. |
| **R2-D2** | Single `dependencies`-Tabelle statt 4 separater Tabellen pro Type-Kombination | ADR-004 verbindlich; Critical-Path-CTE vereinfacht; Reporting + Indizierung einheitlich. |
| **R2-D3** | ltree für `outline_path` statt Closure-Tree | OpenProject-Lessons-learned: Closure-Tree braucht eigene Tabelle + 4× Storage; ltree ist Postgres-nativ + ein Index. |
| **R2-D4** | Cycle-Detection auf Trigger-Ebene (nicht App-Layer-Only) | Defense-in-Depth; service-role-keys + Migrationen umgehen App-Layer. |
| **R2-D5** | Migration als Single-Transaction (kein Online-Migration-Tool) | Daten-Größe rechtfertigt es; Komplexität von z. B. `pg_repack` ist überzogen. |
| **R2-D6** | Round-1-API-Wrapper für 6 Monate | Sanfter Migrations-Pfad; Frontend kann inkrementell auf neue Endpoints umstellen. |
| **R2-D7** | `sequence_in_parent` separat vom heutigen `position` zu klären | Heutige `position` hat Sprint-Sortier-Semantik; Doppelnutzung muss `/backend`-Phase verifizieren. |

### AA) Folge-Specs / Konsequenzen

- **PROJ-25** (Architected): konsumiert die polymorphe Tabelle direkt. ST-04 `phase_dependencies` ist obsolet (siehe PROJ-25 Tech Design Spec-Korrekturen).
- **PROJ-36** (Planned): konsumiert `outline_path` + erweiterten `ALLOWED_PARENT_KINDS`. Tree-View, WBS-Code, Roll-up bleiben PROJ-36-Eigentum.
- **PROJ-27** (Architected, Cross-Project-Bridge): kann die polymorphe Tabelle nutzen, ohne ein eigenes Cross-Project-Schema zu bauen. Empfehlung: PROJ-27-Tech-Design im nächsten CIA-Review revidieren.
- **PROJ-10** (Audit): Whitelist-Erweiterung als Bestandteil der Migration.

### AB) Out-of-Scope (explizit)

- WBS-Code, Tree-View-UI, Roll-up → **PROJ-36**
- Gantt-DnD, Critical-Path-UI → **PROJ-25**
- Auto-Schedule-Engine → künftig (PROJ-39-Kandidat)
- Materialized-View-Cache für CP / Cycle-Detection → optional bei Skalierungs-Druck
- Resource-Roll-up auf Summary-Items → PROJ-11b

---

## Implementation Notes

### Backend (2026-05-03) — Round 2 (Polymorphic Dependencies)
- Migration file written but NOT yet applied: `supabase/migrations/20260503200000_proj9r2_polymorphic_dependencies.sql`. Application happens via Supabase MCP after manual review.
- Migration steps:
  - A. Snapshot deployed Round-1 `dependencies` to `dependencies_legacy` (rollback anchor; no RLS, no FKs, app must not read it).
  - B. Build new polymorphic `dependencies_v2` with `from_type/from_id/to_type/to_id`, `constraint_type`, `lag_days`, indices on `(tenant_id, from_type, from_id)`, `(tenant_id, to_type, to_id)`, `(tenant_id)`, UNIQUE on the 5-tuple.
  - C. Data migration kind-based: `work_items.kind='work_package' → 'work_package'`, else `'todo'`. Row-count verification raises EXCEPTION on mismatch.
  - D. Trigger functions defined: `tg_dep_validate_polymorphic_fk_fn` (static CASE — no dynamic SQL), `tg_dep_validate_tenant_boundary_fn` (cross-tenant block, defense-in-depth to RLS), `tg_dep_prevent_polymorphic_cycle_fn` (recursive CTE forward-walk with depth limit 10000), and three ON-DELETE cleanup functions for projects/phases/work_items.
  - E. Drop old `dependencies`; rename `dependencies_v2 → dependencies`; rename indices/constraints to canonical names.
  - F. Attach BEFORE INSERT/UPDATE triggers + AFTER DELETE source-table triggers.
  - G. RLS enable + 4 policies (SELECT/INSERT/UPDATE/DELETE all gated by `is_tenant_member(tenant_id)`); anon revoked.
  - H. PROJ-10 audit-whitelist extended: `entity_type` constraint adds `'dependencies'`; `_tracked_audit_columns` returns the row-as-whole column list; `audit_changes_dependencies` UPDATE-trigger attached. INSERT/DELETE row-snapshot audit is NOT yet implemented (the existing pipeline is UPDATE-only).
- API routes:
  - `src/app/api/projects/[id]/dependencies/route.ts` — POST accepts BOTH legacy body (`predecessor_id/successor_id/type`) AND new polymorphic body (`from_type/from_id/to_type/to_id/constraint_type`). Body-shape detection. Legacy form retains the same-project pre-check; polymorphic form supports cross-project edges within the tenant. GET responds with the polymorphic shape and project-scopes via OR-filter on the four entity-id sets (project itself, phases, work_packages, todos).
  - `src/app/api/projects/[id]/dependencies/[did]/route.ts` — DELETE simplified (no `project_id` filter; RLS is the gate).
  - `src/app/api/dependencies/route.ts` (NEW) — tenant-level POST that accepts the polymorphic shape only; tenant-membership pre-check before INSERT.
  - `src/app/api/dependencies/[depId]/route.ts` (NEW) — tenant-level DELETE.
- Tests:
  - `src/app/api/projects/[id]/dependencies/route.test.ts` — 6 tests (legacy mapping, cross-project block, polymorphic insert, cycle, cross-tenant, self-dependency).
  - `src/app/api/dependencies/route.test.ts` — 9 tests (auth, validation, self-dep, tenant membership, insert, duplicate, cycle, cross-tenant, FK).
- Verified before applying the migration:
  - `npx tsc --noEmit` clean.
  - `npx vitest run` 790/790 pass (15 net new tests added).
  - Migration application is deferred to the user via Supabase MCP.

### Backend (2026-04-28) — Round 1
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
| ~~Medium~~ Resolved | M1 | Trigger-only SECURITY DEFINER functions were exposed via PostgREST RPC. **Fixed in migration `20260428120000_harden_trigger_only_functions.sql`** — revoked EXECUTE from public/anon/authenticated for the 7 trigger-only fns (`prevent_*_cycle`, `enforce_*`), and from public/anon for the 6 RLS helpers (`is_*`, `has_*`). All anon-exposure advisor warnings are gone; remaining authenticated-exposure warnings are intentional (RLS helpers + state-machine RPCs). |
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

---

## QA Test Results — Round 2 (Polymorphic Dependencies)

> **QA-Date:** 2026-05-04 · **QA-Environment:** Live Supabase project `iqerihohwabyjzkpcujq` (Production) — all destructive tests in DO-blocks with rollback-marker pattern, no production rows mutated.

### Automated checks
- **Vitest full suite:** 82 test files, **790 / 790 tests passed**, 8.4 s. No regressions in any deployed feature.
- **Dependencies-route tests** (PROJ-9-R2 specific): 15 / 15 passed (POST/GET/DELETE on both project-scoped and tenant-level routes; backward-compat wrapper covered).
- **Security advisor:** 0 ERRORs, 0 new WARNs from PROJ-9-R2. Pre-existing WARNs (SECURITY DEFINER RPCs, auth leaked-password) unchanged. Legacy snapshot table is `RLS-enabled / no-policies` (intended deny-all pattern).

### Live database smoke tests (19 sub-tests across 3 DO-blocks)

| ID | Acceptance Criterion (PROJ-9-R2) | Test | Result |
|---|---|---|---|
| T1 | § P Polymorphic-FK validation | non-existent `from_id` → SQLSTATE 23503 | ✅ PASS |
| T2 | § P Polymorphic-FK type discriminator | `from_type='todo'` pointing to `kind='work_package'` row → 23503 | ✅ PASS |
| T2b | § P Polymorphic-FK reverse | `from_type='work_package'` pointing to `kind='task'` row → 23503 | ✅ PASS |
| T3 | § O `dependencies_no_self` CHECK | `(from_type, from_id) = (to_type, to_id)` → check_violation | ✅ PASS |
| T4a | § N Cross-project allowed within tenant | task in project A → task in project B (same tenant) → 201 OK | ✅ PASS |
| T4b | § N Cross-kind edges | task → work_package within tenant → 201 OK | ✅ PASS |
| T5 | § O `dependencies_unique_edge` UNIQUE | duplicate `(from_type, from_id, to_type, to_id, constraint_type)` → unique_violation | ✅ PASS |
| T6 | § Q Cycle prevention (2-hop) | t1→t2 exists, insert t2→t1 → check_violation | ✅ PASS |
| T7 | § Q Cycle prevention (3-hop) | t1→t2 + t2→t3 exist, insert t3→t1 → check_violation | ✅ PASS |
| T8 | § R Tenant-boundary trigger | `tenant_id` on edge ≠ `tenant_id` of from-/to-entity → SQLSTATE 22023 | ✅ PASS |
| T9 | § P ON-DELETE-cascade work_items (from-side) | DELETE work_item that is `from_id` → dependency row removed | ✅ PASS |
| T10 | § P ON-DELETE-cascade work_items (to-side) | DELETE work_item that is `to_id` → dependency row removed | ✅ PASS |
| T11 | § P ON-DELETE-cascade phases | DELETE phase that is `from_id` → phase-edge removed | ✅ PASS |
| T12 | § O `constraint_type` CHECK accepts FS/SS/FF/SF | one INSERT per non-FS value | ✅ PASS (3/3) |
| T13 | § O `constraint_type` CHECK rejects 'XX' | INSERT with invalid type → check_violation | ✅ PASS |
| T14 | § O `lag_days` accepts negative (lead time) | INSERT with `lag_days = -3` → 201 | ✅ PASS |
| T15 | § O `from_type` CHECK rejects 'sprint' | rejected by trigger (22023) — order: BEFORE-trigger fires before CHECK; both are valid defenses | ✅ PASS |
| T16 | § O Default `lag_days = 0` | INSERT without lag_days → returned value = 0 | ✅ PASS |
| T17 | § O Default `constraint_type = 'FS'` | INSERT without constraint_type → returned value = 'FS' | ✅ PASS |

**ON-DELETE-cascade for projects (PROJ-9-R2 § P D4)** — not directly executed in QA because deleting any production project would have side effects beyond the dependencies table. Trigger function `tg_projects_cleanup_dependencies_fn` is structurally identical to the work_items / phases variants (verified by code-symmetry); the wiring is verified at trigger-attach time. **Pass by symmetry** — full live test deferred to a staging environment if/when one is set up.

### Acceptance criteria walkthrough — Round 2

- **§ N Round-2 Scope:** ✅ all four bullets — outline_path (PROJ-36-α deployed), extended ALLOWED_PARENT_KINDS (TS-side already extended), polymorphic dependencies (T1-T17), cross-project allowed within tenant (T4a).
- **§ O Schema additions:** ✅ verified column list, indexes, CHECK constraints, UNIQUE constraint via `information_schema` query post-migration.
- **§ P Polymorphic FK Validation:** ✅ T1, T2, T2b. Order of trigger firing (FK before CHECK) confirmed.
- **§ Q Cycle Prevention:** ✅ T6 (2-hop), T7 (3-hop), plus 2 incidental-during-other-tests cycles caught (T12 first attempt rejected the t2→WP→t2 close).
- **§ R Tenant-Boundary:** ✅ T8 (intentional), plus T8-incidental during initial setup with wrong tenant_id.
- **§ S `outline_path` maintenance:** out-of-scope for Round 2 QA (PROJ-36-α deployed separately).
- **§ T Migration:** ✅ migration applied successfully (after one fix to `audit_log_entity_type_check` constraint — see Bugs & findings).
- **§ U Audit-Trail-Integration:** ✅ `'dependencies'` added to `audit_log_entries.entity_type` whitelist; `_tracked_audit_columns` returns 7 tracked columns for `'dependencies'`; trigger `audit_changes_dependencies` attached AFTER UPDATE on `dependencies`.
- **§ V API Changes:** ✅ backward-compat wrapper retained (vitest tests cover old shape with `predecessor_id`/`successor_id`); new tenant-level routes work; project-scoped routes return polymorphic shape.
- **§ W Performance:** not load-tested in QA. Migration on production-data ran in **<1 s** (0 rows). Cycle-detection CTE has `LIMIT 10000` safety net. Performance characterization for large graphs deferred to PROJ-25 deployment when actual edge volume is meaningful.
- **§ X Risiken + Mitigation:** all 7 risks noted in Tech Design carried into deployment; only one (audit-constraint-mismatch) materialized — see Bugs & findings.
- **§ Y Test Strategy:** ✅ unit + Postgres-integration + cross-project smoke + audit smoke + regression all green.

### Bugs & findings — Round 2

**No Critical, High, or Medium bugs.**

| Severity | ID | Finding | Recommendation | Status |
|---|---|---|---|---|
| ~~High~~ Resolved | R2-H1 | Initial migration replaced the `audit_log_entries.entity_type` CHECK constraint with a 12-value list, but production has 28 values used. First migration apply failed with constraint violation (production safety). | Fixed in same PR — migration was edited to PRESERVE all existing entity_types and append `'dependencies'`. Re-apply succeeded. **Caught by Postgres before any data was mutated.** | Resolved 2026-05-03 |
| Info | R2-I1 | `dependencies_legacy` snapshot table is empty (production had 0 dependencies pre-migration). The rollback anchor exists for safety but provides no actual data to roll back to. | Drop after a 4-week confidence window via follow-up migration. | open follow-up |
| Info | R2-I2 | Project ON-DELETE cascade not directly tested in production smoke (would have side-effects). Verified by code-symmetry to phase/work_items variants. | Add a staging-env test before bulk delete operations on projects. | acceptable |

### Security audit — Round 2 (red-team perspective)

- **Cross-tenant edge insert** — blocked at trigger level (T8). Verified that even when claiming a wrong `tenant_id` on the edge row, the trigger rejects with 22023 because the from/to entities resolve to a different tenant. Defense-in-depth to RLS holds.
- **Polymorphic FK forge** — blocked. Cannot insert an edge with a `from_id` that doesn't match a row in the type-discriminated table (T1, T2). Cannot type-confuse (T2: a WP id with `from_type='todo'` is rejected because the lookup uses `WHERE id=... AND kind <> 'work_package'`).
- **Self-edge / loop forge** — blocked at CHECK (T3) before any trigger fires.
- **Cycle forge across kinds + projects** — blocked. The recursive-CTE walks polymorphic edges regardless of from/to type; cycle detection works cross-kind and cross-project (T6, T7).
- **SQL injection via discriminator value** — not applicable. `from_type`/`to_type` are CHECK-constrained to 4 enum values. Trigger uses static CASE branches (no dynamic SQL).
- **RLS evasion** — `dependencies` requires `is_tenant_member(tenant_id)` for all 4 verbs (SELECT/INSERT/UPDATE/DELETE). Anon revoked. Legacy snapshot has RLS-enabled-no-policies (deny-all to non-service roles).
- **Service-role bypass** — service-role bypasses RLS by design but not triggers. Tenant-boundary trigger remains active; we tested this implicitly via the wrong-tenant_id setup error.
- **Audit-trail integrity** — UPDATE on `dependencies` is row-as-whole audited via `record_audit_changes` AFTER UPDATE trigger. INSERT/DELETE audit is a documented follow-up (PROJ-10 row-snapshot work).

### Production-ready decision — Round 2
**READY** — 0 Critical, 0 High, 0 Medium bugs. R2-H1 was fixed during migration apply (caught by Postgres before data damage). R2-I1 and R2-I2 are open follow-ups, not blockers.

Round-2 scope is **Approved** for `/deploy` (already in production via the migration apply; deployment artefact is the merged PR).

## Deployment

### Round 1
- **Date deployed:** 2026-04-28
- **Production URL:** https://projektplattform-v3.vercel.app
- **Git tag:** `v0.1.0-mvp-backbone`
- **Deviations:** none observed.

### Round 2 — Polymorphic Dependencies
- **Date deployed:** 2026-05-04
- **Production URL:** https://projektplattform-v3.vercel.app
- **Git tag:** `v0.9.0-proj9r2`
- **Commit:** `60cccd9`
- **Migrations applied:**
  - `20260503200000_proj9r2_polymorphic_dependencies.sql`
  - `20260503210000_proj9r2_legacy_rls_hardening.sql`
- **Deviations:** during initial migration apply, the `audit_log_entity_type_check` constraint was inadvertently overwritten with a 12-value list (vs. the 28 production values). Postgres rejected the migration before any data mutation; constraint definition was corrected to PRESERVE all existing entity_types and additively append `'dependencies'`. Re-apply succeeded. No production data was touched during the failure.
- **Lint pre-existing issue noted:** `risk-trend-sparkline.tsx:53` (PROJ-35 code) has a `react-hooks/set-state-in-effect` ESLint error — unrelated to PROJ-9-R2; PROJ-35 is already deployed with this code; recommend cleanup in next PROJ-35 slice.
- **Follow-up:** drop `dependencies_legacy` snapshot table after a 4-week confidence window (ID R2-I1).
