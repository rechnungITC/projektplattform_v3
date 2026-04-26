# PROJ-2: Project CRUD and Lifecycle State Machine

## Status: In Progress
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
The foundational `Project` entity for the platform. Supports create, read, update, soft-delete, and a state machine over lifecycle status (Draft → Active → Paused → Completed/Canceled) with a full audit trail. Every other domain feature (phases, milestones, tasks, risks, stakeholders) hangs off the Project. Reuses V2's validated field shape from migrations `0001_users_projects.py` and `0002_lifecycle_events.py`, adapted to Supabase + multi-tenant + RLS.

## Dependencies
- **Requires PROJ-1** (Authentication, Tenants, Role-Based Membership) — for tenant scoping (`tenant_id`), role-based authorization (admin / member / viewer), and the `profiles` table referenced by `responsible_user_id` and `created_by`.

## User Stories

### Project CRUD
- As a tenant `member`, I want to create a new project with at minimum a name and project type so that I can start tracking it.
- As a tenant `member`, I want to see all my tenant's projects in a list so that I have an overview.
- As a tenant `member`, I want to filter the list by lifecycle status and project type so that I can focus on what's relevant.
- As a tenant `member`, I want to view a single project's full master data so that I can understand its current state.
- As a tenant `member`, I want to edit project master data (name, description, project number, planned dates, responsible user) so that the data stays current.
- As a tenant `member`, I want to soft-delete a project so that it disappears from active views but remains in the audit history.
- As a tenant `admin`, I want to permanently delete a soft-deleted project so that it's gone for good (rare, used for genuine mistakes / GDPR).
- As a tenant `viewer`, I want to see all the same projects but cannot create, edit, transition, or delete them.

### Lifecycle State Machine
- As a tenant `member`, I want to transition a project's lifecycle status (e.g., Draft → Active) so that the state reflects reality.
- As a tenant `member`, I want to add a free-text comment when transitioning state (e.g., "Activated after kickoff meeting") so that the audit trail captures the reason.
- As a tenant `member`, I want to see the full lifecycle history of a project so that I can audit who changed what when and why.
- As a tenant `member`, I want the system to **block** invalid transitions (e.g., Completed → Active) so that I cannot accidentally violate the state machine.
- As a tenant `member`, I want to **reactivate** a Canceled project (back to Draft or Active) so that I can resume work on a previously canceled engagement (e.g., vendor change in ERP).

## Acceptance Criteria

### Database schema
- [ ] `projects` table with fields:
  - `id` (UUID PK)
  - `tenant_id` (UUID NOT NULL FK → `tenants.id` ON DELETE CASCADE)
  - `name` (TEXT NOT NULL, length ≤ 255)
  - `description` (TEXT, nullable)
  - `project_number` (TEXT nullable, length ≤ 100)
  - `planned_start_date` (DATE, nullable)
  - `planned_end_date` (DATE, nullable)
  - `responsible_user_id` (UUID NOT NULL FK → `profiles.id`)
  - `lifecycle_status` (TEXT NOT NULL default `'draft'`, with `CHECK (lifecycle_status IN ('draft','active','paused','completed','canceled'))`)
  - `project_type` (TEXT NOT NULL default `'general'`, with `CHECK (project_type IN ('erp','construction','software','general'))`)
  - `created_by` (UUID NOT NULL FK → `profiles.id`)
  - `created_at`, `updated_at` (TIMESTAMPTZ NOT NULL default `now()`)
  - `is_deleted` (BOOLEAN NOT NULL default `false`)
- [ ] Indexes: `(tenant_id)`, `(tenant_id, lifecycle_status)`, `(tenant_id, project_type)`, `(responsible_user_id)`
- [ ] `project_lifecycle_events` table:
  - `id` (UUID PK)
  - `project_id` (UUID NOT NULL FK → `projects.id` ON DELETE CASCADE)
  - `from_status` (TEXT NOT NULL)
  - `to_status` (TEXT NOT NULL)
  - `comment` (TEXT, nullable)
  - `changed_by` (UUID NOT NULL FK → `profiles.id`)
  - `changed_at` (TIMESTAMPTZ NOT NULL default `now()`)
- [ ] Indexes: `(project_id, changed_at DESC)`

### RLS policies
- [ ] RLS enabled on both tables
- [ ] `projects` SELECT: any tenant member (admin/member/viewer)
- [ ] `projects` INSERT/UPDATE: admin or member only
- [ ] `projects` DELETE (hard): admin only
- [ ] `project_lifecycle_events` SELECT: any tenant member
- [ ] `project_lifecycle_events` INSERT: admin or member only (and cannot be back-dated; `changed_at` set server-side)

### Lifecycle state machine (enforced at API + DB CHECK)
- [ ] Allowed transitions:
  - `Draft` → `Active`, `Canceled`
  - `Active` → `Paused`, `Completed`, `Canceled`
  - `Paused` → `Active`, `Canceled`
  - `Canceled` → `Draft`, `Active` (reactivation)
  - `Completed` → ❌ no outgoing transitions (terminal)
- [ ] Forbidden transitions return HTTP 422 with a clear error message
- [ ] Each successful transition writes a row to `project_lifecycle_events` **atomically** with the `projects.lifecycle_status` update (DB transaction)
- [ ] `project_lifecycle_events.from_status` matches the project's status before the change; `to_status` matches the new status

### CRUD behavior
- [ ] Create: requires `name` and `project_type`; everything else optional; `lifecycle_status` defaults to `'draft'`; `created_by` and `responsible_user_id` default to current user (overridable for `responsible_user_id`)
- [ ] Read (list): returns max 50 rows per page with cursor pagination; supports filter params `lifecycle_status`, `project_type`, `responsible_user_id`; default sort by `updated_at DESC`; excludes soft-deleted by default; query param `?include_deleted=true` for admin trash view
- [ ] Read (detail): returns project + last 20 lifecycle events
- [ ] Update: PATCH semantics; only sent fields are updated; `lifecycle_status` cannot be updated via PATCH (use the dedicated transition endpoint); `tenant_id`, `id`, `created_by`, `created_at` immutable
- [ ] Soft delete: sets `is_deleted = true`; soft-deleted projects are hidden from default lists but still queryable by admins via the trash view
- [ ] Hard delete: only admin role; permanent removal (CASCADE drops `project_lifecycle_events`)

### Validation
- [ ] All API inputs validated with Zod schemas at the route boundary
- [ ] `name` non-empty after trim; `description` ≤ 5000 chars; `project_number` matches a basic pattern (alphanumeric + dash, optional)
- [ ] `planned_end_date` must be ≥ `planned_start_date` if both are set
- [ ] `responsible_user_id` must reference a member of the same tenant (validated server-side)
- [ ] Authentication required on all endpoints

## Edge Cases

- **Forbidden transition attempt.** Member tries Completed → Active → API returns 422 "Completed is a terminal state. Create a new project to continue this work." No DB write.
- **Reactivation of Canceled project.** Member transitions Canceled → Active. Allowed. Both lifecycle events (Active → Canceled, then Canceled → Active) appear in the history.
- **End date before start date.** Validation error at API; clear field-level message.
- **Responsible user from another tenant.** Server-side check confirms the user is a member of the project's tenant; if not, 422 with "User must be a member of this tenant."
- **Responsible user removed from tenant after project creation.** Project keeps the FK; UI displays "(former member)" but does not block other operations. Admin can reassign.
- **Concurrent updates to the same project.** Last write wins for MVP; optimistic concurrency (compare `updated_at`) is deferred to P1.
- **State change on a soft-deleted project.** Blocked: state changes require `is_deleted = false`. API returns 422 "Cannot change state of a deleted project. Restore first."
- **Soft delete with active state.** Allowed at any lifecycle status (including Active). Document this for the user — they're effectively archiving.
- **Hard delete by member.** Blocked by RLS (DELETE policy = admin only); API returns 403.
- **Viewer attempts any write.** Blocked by RLS; 403.
- **List with pagination, project changes mid-cursor.** Standard cursor pagination caveats (skip/duplicate possible if rows shift); acceptable for MVP.
- **Tenant with thousands of projects.** Indexes on `(tenant_id, lifecycle_status)` and `(tenant_id, project_type)` keep filtered lists fast; performance target verifies it.
- **Soft-deleted project's lifecycle events.** Still readable by tenant members via the trash view; never shown in default views.

## Technical Requirements

### Database
- Supabase Postgres with RLS
- DB CHECK constraints for `lifecycle_status` and `project_type` enums
- DB transactions ensure lifecycle_status update + lifecycle_events insert are atomic
- Migration file under `supabase/migrations/`

### API
- Next.js App Router API routes under `src/app/api/projects/`
- Endpoints (proposed):
  - `POST /api/projects` — create
  - `GET /api/projects` — list (filtered, paginated)
  - `GET /api/projects/:id` — detail
  - `PATCH /api/projects/:id` — update (master data)
  - `POST /api/projects/:id/transition` — lifecycle transition (body: `to_status`, optional `comment`)
  - `DELETE /api/projects/:id` — soft delete (admin or member)
  - `DELETE /api/projects/:id?hard=true` — hard delete (admin only)

### Validation
- Zod schemas co-located with each route
- Errors returned as `{ error: { code, message, field? } }`

### Performance
- List endpoint: < 300ms p95 for tenants with up to 1000 projects
- Detail endpoint: < 200ms p95
- Transition endpoint: < 250ms p95

### Out of Scope (deferred)
- Phases, Milestones, Tasks (separate features)
- AI-derived proposals from context
- Output rendering (Gantt, Kanban, exec summaries)
- ERP-specific fields (vendors, modules) — handled in ERP extension feature
- Optimistic concurrency / version conflicts
- Bulk operations (bulk delete, bulk transition)
- Templates / cloning a project to "reactivate" instead of state transition

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

PROJ-2 reuses the patterns established in PROJ-1: Postgres + RLS in Supabase, Next.js App Router for UI and API, shadcn/ui form primitives, Zod validation at the API boundary.

### A) Component Structure (UI)

```
App Shell  (from PROJ-1)
└── /projects                       ← list page
    │   ├── ProjectFilters           (lifecycle status, type, responsible user)
    │   ├── ProjectsTable            (paginated list, max 50 rows)
    │   ├── NewProjectButton         (admin/member only)
    │   └── EmptyState               (when no projects yet)
    │
    └── /projects/[id]               ← detail page
        ├── ProjectHeader            (name, project_number, type badge, status badge)
        ├── LifecycleActionMenu      (Activate, Pause, Complete, Cancel — gated)
        ├── ProjectMasterDataCard    (editable inline; admin/member only)
        ├── ProjectMetadataCard      (created_by, created_at, last update)
        ├── LifecycleHistoryList     (last 20 events; full history on demand)
        └── DangerZone               (admin only: soft-delete; hard-delete with confirm)

Settings  (admin only)
└── /settings/projects-trash        ← soft-deleted projects, restore or hard-delete

Modals / Dialogs
├── NewProjectDialog                 (zod form: name + project_type required)
├── LifecycleTransitionDialog        (target status select + optional comment)
├── EditProjectMasterDataDialog
├── HardDeleteConfirmDialog
└── RestoreProjectDialog
```

All forms use shadcn `Form` + react-hook-form + zod. Status badges use shadcn `Badge` with variant per state. The transition action menu uses shadcn `DropdownMenu`; allowed transitions are computed client-side based on the current status (purely UX — DB is the source of truth).

### B) Data Model

Two new tables in Supabase. Both have RLS enabled.

**`projects`** — one row per project, scoped to a tenant
- `id` — unique identifier
- `tenant_id` — which tenant (FK; cascades on tenant delete; required)
- `name` — display name (≤ 255 chars, required)
- `description` — long text (≤ 5000 chars, optional)
- `project_number` — human-readable identifier (≤ 100 chars, optional)
- `planned_start_date`, `planned_end_date` — optional dates
- `responsible_user_id` — link to a `profiles` row that **must be a member of the same tenant**
- `lifecycle_status` — `draft` / `active` / `paused` / `completed` / `canceled` (default `draft`; DB CHECK)
- `project_type` — `erp` / `construction` / `software` / `general` (default `general`; DB CHECK)
- `created_by`, `created_at`, `updated_at` — audit
- `is_deleted` — boolean for soft-delete (default `false`)

**`project_lifecycle_events`** — append-only audit of every state change
- `id` — unique identifier
- `project_id` — which project (FK; cascades on project delete)
- `from_status`, `to_status` — both required
- `comment` — free-text optional reason
- `changed_by`, `changed_at` — audit

**Indexes:** `projects(tenant_id)`, `projects(tenant_id, lifecycle_status)`, `projects(tenant_id, project_type)`, `projects(responsible_user_id)`, `project_lifecycle_events(project_id, changed_at DESC)`. The compound `(tenant_id, ...)` indexes keep filtered list pages fast — RLS policies always filter by tenant_id first, so leading the index with it is essential.

### C) Authorization (RLS Strategy)

Single source of truth. Reuses PROJ-1's helper functions: `is_tenant_member(tenant_id)`, `has_tenant_role(tenant_id, role)`, `is_tenant_admin(tenant_id)`.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `projects` | tenant member (any role) | admin or member | admin or member | **admin only** (hard delete) |
| `project_lifecycle_events` | tenant member (any role) | written exclusively by the `transition_project_status` function (service-context inside the SECURITY DEFINER function) | never | via FK cascade only |

**Soft-delete UPDATE** falls under the `projects.UPDATE` policy → admin and member can soft-delete. **Hard delete** is the only operation gated to admin.

**Viewer = read-only** falls out of the policy table: viewers match SELECT but not INSERT/UPDATE/DELETE.

**Cross-tenant attack surface:** a malicious user trying to set `tenant_id = <other-tenant>` on INSERT is blocked because the WITH CHECK clause requires `is_tenant_member(NEW.tenant_id)`. A malicious UPDATE trying to move a project to another tenant is similarly blocked.

### D) Lifecycle State Machine

**Allowed transitions** (verified at two layers, as in PROJ-1's last-admin guard):

```
        ┌──────┐    ┌────────┐    ┌────────┐
        │ draft│←──→│ active │←──→│ paused │
        └─┬────┘    └─┬──────┘    └────┬───┘
          │           │                 │
          │           ↓                 ↓
          │      ┌──────────┐    ┌──────────┐
          └─────→│ canceled │    │completed │
                 └─────┬────┘    └──────────┘
                       │            (terminal — no edges out)
                       ↓
                       reactivate to draft or active
```

**Concrete edges:**
- `draft` → `active`, `canceled`
- `active` → `paused`, `completed`, `canceled`
- `paused` → `active`, `canceled`
- `canceled` → `draft`, `active` (reactivation)
- `completed` → ❌ no outgoing edges

**Mechanism — DB function `transition_project_status(p_project_id, p_to_status, p_comment)`** (SECURITY DEFINER, hardened search_path, EXECUTE granted to `authenticated`):

1. Read the project's current `lifecycle_status` and `tenant_id`
2. Verify the caller is a tenant member with role admin or member (uses `has_tenant_role`)
3. Validate the transition is in the allowed-edge set; if not, raise `check_violation`
4. UPDATE `projects.lifecycle_status` to `p_to_status`
5. INSERT a row into `project_lifecycle_events` with `from_status`, `to_status`, `p_comment`, `changed_by = auth.uid()`
6. Return the new status as JSONB (consistent with `handle_new_user`'s shape; avoids RETURNS-TABLE shadow bug)

**Why a DB function instead of an API-side transaction:**
1. **State machine lives next to the data.** Future Edge Functions (e.g., a scheduled re-evaluator) and direct DB ops also benefit from the validation; the API isn't the only writer over time.
2. **Atomic by construction.** No risk of the API process dying between UPDATE and INSERT.
3. **Defense in depth** alongside Zod-based validation in the API route (early, helpful errors).

**Why grant EXECUTE to `authenticated` (not service_role-only like `handle_new_user`):** transitions are user-initiated normal operations, not admin setup. RLS on `projects` still gates which projects the user can see in the first place.

### E) API Surface (Next.js App Router)

```
POST   /api/projects                       ← create
GET    /api/projects                       ← list (filters + cursor pagination)
GET    /api/projects/[id]                  ← detail (project + last 20 events)
PATCH  /api/projects/[id]                  ← update master data (NOT lifecycle_status)
POST   /api/projects/[id]/transition       ← lifecycle change (calls DB function)
DELETE /api/projects/[id]                  ← soft delete
DELETE /api/projects/[id]?hard=true        ← hard delete (admin only)
```

All routes:
- Authenticated session required (Supabase SSR client; 401 otherwise)
- Zod schemas at the boundary; errors as `{ error: { code, message, field? } }`
- Use the **user-context client** (RLS enforces authz) — no service-role key needed for this feature
- DB function errors (CHECK violations, last-admin-style invariants) surfaced as HTTP 422 with the trigger's message

**List endpoint specifics:**
- Default sort: `updated_at DESC`
- Filters via query params: `lifecycle_status`, `project_type`, `responsible_user_id`, `include_deleted`
- Pagination: cursor-based (limit 50; cursor = last `updated_at` + `id` for stable sort)
- Excludes soft-deleted unless `include_deleted=true` AND caller is admin (RLS still applies — admin sees the row, but the public endpoint hides them by default)

### F) Validation Rules

| Field | Rule |
|---|---|
| `name` | trim non-empty, ≤ 255 |
| `description` | ≤ 5000 |
| `project_number` | optional; alphanumeric + dash pattern |
| `planned_end_date` | must be ≥ `planned_start_date` if both set |
| `responsible_user_id` | must be a member of the same tenant — server-side check (a query against `tenant_memberships`) |
| `project_type` | DB CHECK enum |
| `lifecycle_status` | DB CHECK enum + state-machine function |

### G) Frontend Wiring (no backend coupling beyond Supabase client)

- **List page** uses `supabase.from("projects").select(...)` directly with RLS — no API route needed for read paths.
- **Mutations** (create, update, transition, soft-delete) go through Next.js API routes so we have one place for logging, audit hooks, and edge cases.
- **Detail page** also uses direct Supabase client read for the project, but uses an API route for transitions (so the DB function is called server-side, in case we want to add server-side observability later).

### H) Tech Decisions Justified

| Decision | Why |
|---|---|
| DB function for state transitions | Atomicity + state machine lives near the data + reusable across surfaces |
| `lifecycle_status` and `project_type` as `TEXT + CHECK` (not Postgres ENUM) | Easier to extend (add `general-construction` or new project types via a small migration); consistent with PROJ-1's `role` choice |
| Soft-delete = `is_deleted` flag (not separate table) | Simplest; admin trash view is a `WHERE is_deleted = true` query |
| Hard-delete behind `?hard=true` query param | Explicit opt-in; harder to fat-finger in a UI confirm dialog |
| `responsible_user_id` validated against `tenant_memberships` | Prevents pointing a project at a user from another tenant |
| Direct Supabase client for reads, API routes for writes | Reads are RLS-safe and cheap to do client-side; writes deserve a stable boundary for future cross-cutting concerns (audit, rate limit) |
| Cursor pagination (not offset) | Stable under concurrent updates; avoids skip/duplicate for users editing while paging |

### I) Dependencies (npm packages)

**No new dependencies.** Everything reuses what PROJ-1 already brought in: `@supabase/supabase-js`, `@supabase/ssr`, `react-hook-form`, `zod`, `@hookform/resolvers`, `sonner`, shadcn primitives, `lucide-react`.

### J) Migration

- **File:** `supabase/migrations/20260425150000_proj2_projects_lifecycle.sql`
- Single migration: tables → indexes → RLS enable + 7 policies → `transition_project_status` function + EXECUTE grant
- Sequenced after `20260425140000_proj1_fix_handle_new_user_ambiguous.sql` (PROJ-1's last)
- No backfill needed — fresh tables on top of empty DB

### K) Out of Scope (deferred to later features)

- Phases, Milestones, Tasks (separate features PROJ-19, PROJ-9 in roadmap)
- AI-derived proposals from project context (PROJ-12)
- Output rendering — Gantt, Kanban, exec summaries (PROJ-7)
- ERP-specific fields like vendor links (PROJ-15)
- Optimistic concurrency / version conflicts on simultaneous edits — last-write-wins for MVP
- Bulk operations (bulk transition, bulk delete) — single-row only for MVP
- Templates / cloning a project as a "reactivate" alternative to state transition

### L) Trade-offs to Acknowledge

| Trade-off | Chosen direction | Why okay for MVP |
|---|---|---|
| Last-write-wins on master data updates | No optimistic concurrency check | Project metadata changes rarely have simultaneous writers; can add `If-Match` header later |
| Soft-deleted projects are queryable by admins | `?include_deleted=true` exposes them | Predictable, auditable; RLS still enforces tenant isolation |
| Lifecycle history limit on detail page | Last 20 events shown by default | Most projects have < 10 transitions; full history available via dedicated endpoint later |
| Reactivation creates a new event row, not a status revert | Each transition is its own audit row | Audit trail captures the truth; reporting can compute "current vs original status" if needed |

## Implementation Notes

### Frontend (done — commit 5fb1490)

**New files:**
- Types: `src/types/project.ts` (Project, ProjectLifecycleEvent, LifecycleStatus, ProjectType, `ALLOWED_TRANSITIONS` map)
- Hooks: `src/hooks/use-projects.ts` (cursor pagination, filters), `src/hooks/use-project.ts` (detail + last 20 events)
- Pages: `src/app/(app)/projects/page.tsx` + client, `src/app/(app)/projects/[id]/page.tsx` + client, `src/app/(app)/settings/projects-trash/page.tsx` + client
- Components in `src/components/projects/`: `lifecycle-badge`, `project-type-badge`, `responsible-user-picker`, `date-picker-field` (Popover+Calendar), `projects-table` (shared via `trashMode`), 6 dialogs
- shadcn `calendar` added; pulled `react-day-picker` + `date-fns` as transitive deps

**PROJ-1 files modified (additive only):**
- `src/app/(app)/settings/settings-tabs.tsx` — admin-only "Projects Trash" tab via `visibleTo: Role[]` predicate
- `src/components/app/top-nav.tsx` — primary nav row with Dashboard/Projects links

**Role gating verified:**
- `viewer`: read-only
- `member`: full CRUD + transitions + soft-delete
- `admin`: + hard-delete (behind "Show advanced") + Trash tab

**Backend stubs (UI shows `toast.warning` on 404):**
- POST `/api/projects` — create
- PATCH `/api/projects/[id]` — update + restore (`{ is_deleted: false }`)
- POST `/api/projects/[id]/transition` — lifecycle change
- DELETE `/api/projects/[id]` — soft delete
- DELETE `/api/projects/[id]?hard=true` — hard delete

Read paths use Supabase client directly with RLS — list and detail bypass any custom API route. Joins assume FK constraint names `projects_responsible_user_id_fkey` and `projects_created_by_fkey`; backend migration must declare them so the named-FK shorthand resolves.

**Verification:** `npx tsc --noEmit` clean, `npm test` 27/27 pass, `npm run build` succeeds (14 routes).

### Backend (done)

**Migration applied to `iqerihohwabyjzkpcujq`:** `supabase/migrations/20260425150000_proj2_projects_lifecycle.sql`
- 2 new tables (`projects`, `project_lifecycle_events`) with RLS enabled, 6 indexes
- 5 RLS policies (4 on projects, 1 on lifecycle events; events INSERT/UPDATE/DELETE denied → only the SECURITY DEFINER function writes)
- Cross-tenant guard trigger `enforce_project_responsible_user_in_tenant` (BEFORE INSERT/UPDATE)
- `transition_project_status(p_project_id, p_to_status, p_comment)` — atomic state-machine + audit; returns `jsonb`; `EXECUTE` granted to `authenticated`
- moddatetime trigger on `projects.updated_at`
- anon-SELECT revoked on both new tables (consistent with PROJ-1 hardening)
- Advisors: 0 new warnings introduced (the one remaining advisor warning is about a global Auth setting unrelated to PROJ-2)

**API routes:** `src/app/api/projects/`
- `route.ts` — POST create, GET list (cursor pagination, filters, RLS-scoped)
- `[id]/route.ts` — GET detail (project + last 20 events), PATCH update (lifecycle_status excluded), DELETE (soft default; `?hard=true` admin-only via service-role)
- `[id]/transition/route.ts` — POST lifecycle change via RPC, error-code mapping (23514→422, 42501→403, 02000→404, 22023→422)
- Shared `route-helpers.ts` reused for auth + admin checks + error envelope

**FK constraint names verified to match frontend named-FK shorthand:**
- `projects_responsible_user_id_fkey`, `projects_created_by_fkey`, `project_lifecycle_events_changed_by_fkey`

**Tests:** 49 vitest cases in 3 colocated files (project list/create + project detail/update/delete + transition); total project test count 76 (39 PROJ-1 + 37 PROJ-2).

**Verification:** `npx tsc --noEmit` clean, `npm test` 76/76, `npm run build` 17 routes.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
