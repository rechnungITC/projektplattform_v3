# PROJ-19: Phases & Milestones — Cross-cutting Schedule Backbone

## Status: In Progress
<!-- Frontend (commit 96f2976) + Backend (commit pending) shipped; QA pending -->

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

### A) Kurzantwort

**Zwei separate Tabellen** (`phases`, `milestones`) — bleiben getrennt vom `work_items`-Metamodell aus PROJ-9, weil ihre zeitspezifischen Felder (geplante Daten, Sequenznummer, Phase→Milestone-Beziehung) sonst die generische Tabelle verwässern. **Status-Transitions als CHECK + Trigger** für die Phasen-Statemachine; Milestone-Status als reines CHECK (zu wenig Komplexität für Trigger). **Overdue-Detection** ist eine berechnete Spalte — kein gespeicherter Flag, sondern Query-Time-Berechnung. **Sequence-Number** als INT mit Uniqueness pro Projekt; Reorder-Endpoint macht eine atomare Re-Index-Transaktion.

### B) Component Structure (UI)

```
/projects/[id]/planung              ← Planning tab (PROJ-7 mounts; PROJ-19 ships content)
├── PhasesTimeline                   horizontal sequence bar — "active phase" highlight
├── PhaseList (card per phase)
│   ├── Header: name + status badge + "edit" button
│   ├── Date range (planned vs. actual)
│   ├── Progress bar (% of phase elapsed)
│   ├── Milestones in this phase (sub-list)
│   └── Work-Packages in this phase (sub-list, links to PROJ-9)
├── MilestonesList (alternative tab — flat list of all milestones, filterable)
│   ├── Filter: by phase / by status / "overdue only"
│   └── Item card: name, target date, status, phase badge, achieved badge
└── NewPhase / NewMilestone buttons (project_lead/editor only)

Dialogs:
├── NewPhaseDialog            (name, description, planned dates, sequence)
├── EditPhaseDialog
├── ReorderPhasesDialog       (drag-handle list — atomic re-sequence)
├── PhaseStatusTransitionDialog
├── DeletePhaseDialog         (warn if work_packages attached; force=true escalation)
├── NewMilestoneDialog
├── EditMilestoneDialog
├── MilestoneStatusDialog     (achieved / missed / cancelled)
└── DeleteMilestoneDialog
```

### C) Data Model

#### `phases`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID NOT NULL FK tenants ON DELETE CASCADE | denormalized for RLS perf |
| `project_id` | UUID NOT NULL FK projects ON DELETE CASCADE | |
| `name` | TEXT NOT NULL | length ≤ 255 |
| `description` | TEXT | optional, ≤ 5000 |
| `planned_start` | DATE | nullable |
| `planned_end` | DATE | nullable; CHECK ≥ planned_start when both set |
| `actual_start` | DATE | nullable |
| `actual_end` | DATE | nullable |
| `sequence_number` | INTEGER NOT NULL | UNIQUE per project; 1-based |
| `status` | TEXT NOT NULL DEFAULT `'planned'` | CHECK in `('planned','in_progress','completed','cancelled')` |
| `created_by`, `created_at`, `updated_at` | audit | |
| `is_deleted` | BOOLEAN DEFAULT false | soft-delete |

**Indexes:**
- UNIQUE `(project_id, sequence_number) WHERE is_deleted = false` — uniqueness only among live rows
- `(project_id, status)` — "active phase" lookup
- `(project_id, planned_start)` — Gantt sorting

#### `milestones`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `tenant_id` | UUID NOT NULL FK tenants ON DELETE CASCADE | |
| `project_id` | UUID NOT NULL FK projects ON DELETE CASCADE | |
| `phase_id` | UUID FK phases ON DELETE SET NULL | optional; nulled if phase deleted |
| `name` | TEXT NOT NULL | length ≤ 255 |
| `description` | TEXT | optional |
| `target_date` | DATE NOT NULL | required |
| `actual_date` | DATE | nullable |
| `status` | TEXT NOT NULL DEFAULT `'planned'` | CHECK in `('planned','achieved','missed','cancelled')` |
| `created_by`, `created_at`, `updated_at` | audit | |
| `is_deleted` | BOOLEAN DEFAULT false | soft-delete |

**Indexes:**
- `(project_id, target_date)` — overdue + chronological lookups
- `(project_id, status)` — filtering
- `(phase_id)` — phase → milestones lookup

### D) State Machines

#### `phases.status`

| From | Allowed To |
|---|---|
| `planned` | `in_progress`, `cancelled` |
| `in_progress` | `completed`, `cancelled` |
| `completed` | `in_progress` (re-open with audit note) |
| `cancelled` | `planned` (revival with audit note) |

**Mechanism:** DB function `transition_phase_status(p_phase_id, p_to_status, p_comment)` — analogous to PROJ-2's `transition_project_status`. Returns JSONB. Validates transition. Writes an audit row (PROJ-10 once it exists; for V1 a `phase_status_events` mini-table).

When `to_status = 'completed'`: emits a hook event for PROJ-18 (compliance gate check). For V1 this is a `pg_notify('phase_completed', json)` so PROJ-18 can subscribe later — no synchronous coupling.

#### `milestones.status`

Lighter — just CHECK constraint; no DB function. API handles transitions.

| From | Allowed To |
|---|---|
| `planned` | `achieved`, `missed`, `cancelled` |
| `achieved` | (terminal — but `actual_date` editable) |
| `missed` | `achieved` (late achievement allowed) |
| `cancelled` | `planned` (revival) |

**Overdue is computed, not stored:**
```
status = 'planned' AND target_date < CURRENT_DATE  →  derived `is_overdue = true`
```

Frontend + API compute this; no boolean column. Avoids stale state.

### E) Sequence-Number Reordering (Phases)

**Problem:** Inserting a new phase between phase 2 and 3 requires shifting 3, 4, 5 by +1. Concurrent reorders could deadlock.

**Solution:** Atomic reorder API endpoint
```
POST /api/projects/[id]/phases/reorder
Body: { ordered_ids: [uuid, uuid, uuid, ...] }
```

The handler runs in a single transaction:
1. Verify all IDs belong to the project (RLS enforces too).
2. Verify the array is a permutation of the project's existing phase IDs.
3. UPDATE each row's `sequence_number` to its new position (1-based).

Single sequenced UPDATE per row — Postgres serializes them within the transaction. The UNIQUE constraint is **deferrable** (`DEFERRABLE INITIALLY IMMEDIATE`) so we can re-set all sequence numbers within the transaction without temporary collision.

**Why not fractional positions like PROJ-9 work_items**: phases are few (typically 3–8 per project), reorder is rare. The simpler integer approach is fine.

### F) RLS Strategy

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `phases` | `is_project_member(project_id)` | `has_project_role(project_id, 'lead') OR has_project_role(project_id, 'editor')` | same | `is_project_lead(project_id)` |
| `milestones` | `is_project_member(project_id)` | `has_project_role(project_id, 'lead') OR has_project_role(project_id, 'editor')` | same | `is_project_lead(project_id)` |

(All helpers from PROJ-4.)

**Soft-delete (`is_deleted = true`)** — UPDATE policy applies → editors and leads can soft-delete; hard-delete via `?hard=true` admin route only.

**anon SELECT** revoked.

### G) Cross-Feature Hooks

| Trigger | Where | What |
|---|---|---|
| Phase deleted with attached work_packages (PROJ-9) | API DELETE `/api/projects/[id]/phases/[pid]` | Pre-check — if `?force=false` (default) and any work_packages have `phase_id=this`, return 409 with detail; if `?force=true`, allow delete (FK ON DELETE SET NULL on work_packages.phase_id automatically nulls them) |
| Milestone deleted with attached work_packages | same logic | analogous |
| Phase status → 'completed' | DB function `transition_phase_status` | `pg_notify('phase_completed', ...)` for PROJ-18 |
| Milestone overdue | computed at query time | feeds `project.health` KPI (PROJ-7) |

### H) API Surface

```
POST   /api/projects/[id]/phases                            create phase
GET    /api/projects/[id]/phases                            list (sorted by sequence_number)
GET    /api/projects/[id]/phases/[pid]                      detail (incl. milestones)
PATCH  /api/projects/[id]/phases/[pid]                      update master data (NOT status, NOT sequence)
POST   /api/projects/[id]/phases/[pid]/transition           change status (calls DB fn)
POST   /api/projects/[id]/phases/reorder                    atomic re-sequence
DELETE /api/projects/[id]/phases/[pid]                      soft delete; ?force=true to allow with attached WPs

POST   /api/projects/[id]/milestones                        create
GET    /api/projects/[id]/milestones                        list (filterable: phase_id, status, overdue)
GET    /api/projects/[id]/milestones/[mid]                  detail
PATCH  /api/projects/[id]/milestones/[mid]                  update master data (incl. status)
DELETE /api/projects/[id]/milestones/[mid]                  soft delete
```

All routes use the shared `requireProjectAccess(projectId, action)` helper (PROJ-4 M2 follow-up). Validation via Zod; CHECK violations from DB → 422.

### I) Validation Rules

| Field | Rule |
|---|---|
| `phases.name` | non-empty trim, ≤ 255 |
| `phases.planned_end` | ≥ `planned_start` if both set |
| `phases.actual_end` | ≥ `actual_start` if both set |
| `phases.sequence_number` | positive integer; uniqueness per project handled by index |
| `phases.status` | CHECK enum |
| `milestones.name` | non-empty trim, ≤ 255 |
| `milestones.target_date` | required |
| `milestones.actual_date` | only allowed when `status = 'achieved'` (API enforced; not DB) |
| `milestones.status` | CHECK enum |

### J) Migration Plan

`supabase/migrations/20260428090000_proj19_phases_milestones.sql` — must run **before** PROJ-9's migration so `work_items.phase_id` and `work_items.milestone_id` FK to existing tables.

Sections:
1. Tables (`phases`, `milestones`) + indexes
2. Deferrable unique constraint on `phases(project_id, sequence_number) WHERE is_deleted = false`
3. CHECK constraints (status enums, date ordering)
4. `transition_phase_status` DB function (SECURITY DEFINER, hardened search_path) + grant to authenticated
5. RLS enable + 6 policies (3 per table)
6. anon hardening (revoke SELECT)
7. (Optional V1) `phase_status_events` mini-audit table OR defer to PROJ-10

### K) Tech Decisions Justified

| Decision | Why |
|---|---|
| Phases + milestones as separate tables (not in `work_items`) | Per V2 ADR `work-item-metamodel.md`: time-specific fields don't fit the metamodel; reuse would mean lots of nullable columns and special cases |
| Phase status as DB function (not just CHECK) | Defense-in-depth + atomic write of audit event + hook for PROJ-18 — same pattern as PROJ-2's `transition_project_status` |
| Milestone status as CHECK only | Simpler state machine; transitions done at API layer; not enough complexity to justify a DB function |
| `is_overdue` computed, not stored | A boolean would go stale; CURRENT_DATE comparison is cheap with a `(project_id, target_date)` index |
| Sequence number as INT (not fractional) | Phases are few (3–8 typical) and reorder is rare; simpler than fractional indexing; deferrable UNIQUE handles concurrent reorder atomically |
| Reorder as a single atomic API call | Avoids client-side N PATCH calls + race conditions; one transaction guarantees consistency |
| `phase_id` on milestones SET NULL on phase delete | Milestones survive phase deletion; user can re-attach or delete manually |
| `pg_notify` instead of synchronous PROJ-18 call | Decouples PROJ-19 from PROJ-18's existence; PROJ-18 subscribes when it ships; no breakage if it never does |
| Hard-delete with `?force=true` for phases with work_packages | Explicit user intent; protects against accidental data loss |

### L) Out of Scope (deferred)

- **Critical-path computation** — PROJ-7 Gantt enhancement (later)
- **Auto-shift of dependent items** when a phase moves — explicit Nicht-AK
- **Approval gates on phases** — governance epic, future
- **Phase templates** — PROJ-18 compliance templates and PROJ-6 starter structures cover this
- **Drag-and-drop reorder UI** — V1 uses a list+up/down arrows pattern (per ADR `backlog-board-view`); DnD later
- **Per-tenant configurable status enums** — not needed; the four phase statuses + four milestone statuses are universal

### M) Trade-offs Acknowledged

| Trade-off | Chosen | Why okay |
|---|---|---|
| Phase status engine in DB function | DB function | Atomic + hook-able; same pattern users will recognize from PROJ-2 |
| Milestone status without DB function | App-layer enforcement | State machine is too simple to justify; CHECK + Zod is enough |
| Two separate tables instead of one | separate | V2 ADR already decided; rebuilding into `work_items` adds N nullable columns |
| `pg_notify` for PROJ-18 hook | event-based | Truly decoupled; PROJ-18 listens when ready; works even if PROJ-18 never lands |
| Force-flag for phase delete | explicit `?force=true` | Default protects users; advanced operators get the escape hatch |
| Sequence number as INT (not fractional) | INT | Simplicity wins for the rare-reorder, few-rows case |
| `is_overdue` as derived value | computed | Always accurate; no scheduled refresh job; no stale state |

## Implementation Notes
_To be added by /frontend and /backend_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
