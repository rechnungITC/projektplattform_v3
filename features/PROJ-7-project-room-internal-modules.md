# PROJ-7: Project Room with Internal Kanban / Scrum / Gantt Modules

## Status: Planned
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
Once a project is created, the user enters its project room — a tab-based detail page covering Übersicht, Planung, Backlog, Stakeholder, Mitglieder, Historie, Einstellungen. Inside the Backlog tab, internal Kanban and Scrum board views work without external tools; the Planning tab gives a Gantt-flavored phase/milestone/work-package view. Adds the Risikoregister and Budget modules as further project-room cards. Inherits V2 EP-05.

## Dependencies
- Requires: PROJ-2 (Project CRUD)
- Requires: PROJ-4 (Platform Foundation: project nav)
- Requires: PROJ-6 (Rule engine for active modules)
- Requires: PROJ-9 (Work item metamodel) — backlog/board reads from it
- Influences: PROJ-11 (Resources) — Gantt resource bars feed in later

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-05-projektraum-und-interne-module.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-05.md` (ST-01 project room shell, ST-02 Kanban, ST-03 Scrum, ST-04 Gantt, F4.2 risks, F4.5 budget, ST-05 portfolio Gantt, ST-06 health traffic light)
- **ADRs:** `docs/decisions/project-room.md`, `docs/decisions/backlog-board-view.md`
- **V2 code paths to study during /architecture and /backend:**
  - `apps/web/app/projects/[id]/page.tsx` — V2's tab-based room
  - `apps/web/app/projects/[id]/components/Backlog/` — list+board toggle, arrow-button card movement
  - `apps/api/src/projektplattform_api/routers/work_items.py` — backlog filter + status PATCH
  - `apps/api/src/projektplattform_api/routers/risks.py`, `budget.py` — risk register + budget endpoints
  - `apps/api/src/projektplattform_api/services/health.py` — traffic-light formula

## User Stories
- **[V2 EP-05-ST-01]** As a user, I want a project room to appear automatically after project creation so that I can immediately work inside the project.
- **[V2 EP-05-ST-02]** As a user, I want an internal Kanban board so that I can run projects without external tools.
- **[V2 EP-05-ST-03]** As a user, I want an internal Scrum structure (Backlog + Sprint reference) so I can run agile projects without external tools.
- **[V2 EP-05-ST-04]** As a user, I want an internal Gantt so that classical projects are time-plannable inside the platform.
- **[V2 F4.2]** As a project lead, I want to capture, score, and track risks with mitigations so that risks are centrally visible and steerable.
- **[V2 F4.5]** As a project lead, I want to manage the project budget envelope, line items, and consumption so that budget deviations show up early.
- **[V2 EP-05-ST-05]** As a tenant admin or PMO, I want a portfolio-Gantt across all projects so that I see schedule conflicts at a glance.
- **[V2 EP-05-ST-06]** As a project lead or PMO, I want a green/yellow/red health traffic light per project derived from risk score, milestone slip, and budget burn so that I see where to act.

## Acceptance Criteria

### Project room shell
- [ ] After project creation the user lands on the project room (`/projects/[id]?tab=overview`).
- [ ] Default tabs: Übersicht, Planung, Backlog, Stakeholder, Mitglieder, Historie, Einstellungen.
- [ ] Tabs are URL-bound (`?tab=…`).
- [ ] Tab visibility is gated by `active_modules` from the rule engine (PROJ-6).
- [ ] Cross-tenant access → 404; missing project membership → 403 (per PROJ-4 RBAC).

### Kanban board (Backlog tab → Board view toggle)
- [ ] Backlog tab has List/Board toggle.
- [ ] Board has at least 5 columns mapping to `WorkItemStatus` enum (`offen → in_progress → blockiert → erledigt → abgebrochen`).
- [ ] Cards have left/right arrow buttons that PATCH status to prev/next enum value.
- [ ] Status changes are auto-audited (PROJ-10 hook).
- [ ] Filter chip strip shows only kinds present in the current project.

### Scrum structure
- [ ] Optional `sprints` table: `id, tenant_id, project_id, name, start_date, end_date, is_active`.
- [ ] `work_items.sprint_id` (nullable FK to sprints).
- [ ] Backlog list view groups by sprint (or "no sprint").
- [ ] Epic → Story → Task hierarchy is visible via parent links.
- [ ] Bugs visible in Scrum context.

### Gantt structure
- [ ] Planning tab renders a time axis showing phases, milestones, and work_packages.
- [ ] Each Gantt entity has start + end date (work_packages: `planned_start`/`planned_end`; phases: `planned_start`/`planned_end`; milestones: `target_date`).
- [ ] At least one finish-to-start dependency between two entities is storable.
- [ ] Schedule changes update the view after save.

### Risk register (F4.2)
- [ ] Table `risks` with: `id, tenant_id, project_id, title, description, probability (1-5), impact (1-5), score (computed), mitigation, status (open/mitigated/accepted/closed), responsible_user_id, created_at, updated_at`.
- [ ] CRUD endpoints + UI tab/card.
- [ ] Status changes are audited (PROJ-10).
- [ ] CSV export of the risk list.

### Budget module (F4.5)
- [ ] Table `budget_items` with: `id, tenant_id, project_id, category, planned_amount_cents, actual_amount_cents, currency, notes, created_at, updated_at`.
- [ ] Aggregate budget = sum of planned; consumption = sum of actual.
- [ ] Traffic-light: yellow at >80% consumed, red at >100%.
- [ ] CRUD + audit.
- [ ] CSV/PDF export.

### Portfolio Gantt (EP-05-ST-05)
- [ ] `/reports/portfolio-gantt` (admin/PMO only) renders one bar per project (start = min phase start, end = max milestone target_date).
- [ ] Filters: project type, method, lifecycle status, time range.
- [ ] Read-only; PNG + CSV export.

### Health traffic light (EP-05-ST-06)
- [ ] Server function computes per-project health from: risk score (≥12 → red, ≥8 → yellow, else green), milestone slippage (>14 days overdue → red, >0 → yellow), budget burn (>100% → red, >80% → yellow).
- [ ] Total health = max severity across the three dimensions.
- [ ] Health appears in `/projects` list and on portfolio Gantt.
- [ ] Tooltip explains which dimension drove the color.

## Edge Cases
- **Cross-tenant project access** → 404 (RLS).
- **Empty project** (no work items, no risks, no budget) → all dimensions return green; tabs render empty states with helpful CTAs.
- **Method changed mid-project** → board column visibility unchanged; only kind filter chips adjust.
- **A risk with score ≥12 but status `closed`** → does not drive red health (only open/active risks count).
- **A user without `risks` module access** → tab hidden + API returns 404 (per PROJ-17 module gating).
- **Portfolio Gantt requested by a tenant_member without PMO role** → 403; falls back to admin-only.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase, shadcn/ui (`Tabs`, `Card`, `Table`, `Tooltip`, `Badge`). For Gantt: a lightweight library (e.g. `gantt-task-react`) or hand-rolled timeline; decide in /architecture.
- **Multi-tenant:** Every new table (`sprints`, `risks`, `budget_items`, plus future) MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS uses `is_tenant_member(tenant_id)` and `is_project_member(project_id)` (from PROJ-4).
- **Validation:** Zod schemas at API boundaries.
- **Auth:** Supabase Auth; project role checks (project_lead/editor/viewer from PROJ-4).
- **Performance:** Backlog board: use index on `(project_id, status, kind)`. Health computation: cache per project for 60s; recompute on write to risks/budget/milestones.
- **Audit hook:** Status changes trigger PROJ-10 audit (or its hook signal table).

## Out of Scope (deferred or explicit non-goals)
- WIP limits on Kanban.
- Drag-and-drop card movement (arrow buttons in v1; DnD when sort within column matters).
- Velocity / burndown charts.
- Resource swimlanes on Gantt (PROJ-11 work).
- Approval gates on phases (later governance epic).
- Per-tenant configurable health thresholds (deferred).

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
