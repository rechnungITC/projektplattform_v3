# PROJ-2: Project CRUD and Lifecycle State Machine

## Status: Planned
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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
