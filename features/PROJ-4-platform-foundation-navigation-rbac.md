# PROJ-4: Platform Foundation — Navigation, Project Roles, RBAC Enforcement

## Status: Planned
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
The application shell that users see after login: global primary navigation (Projekte, Stammdaten, Konnektoren, Reports, Einstellungen), a project-scoped secondary navigation that appears once a project is open, the dual-layered role model (tenant roles from PROJ-1 plus per-project roles), and the technically enforced visibility/edit rules across UI and API. Inherits V2 EP-02 (Plattformfundament, Navigation und Rollen).

## Dependencies
- Requires: PROJ-1 (Auth, Tenants, Roles) — for tenant roles (admin/member/viewer)
- Requires: PROJ-2 (Project CRUD) — for the project entity that secondary nav scopes to

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-02-plattformfundament-navigation-rollen.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-02.md` (ST-01..ST-04)
- **ADRs:** `docs/decisions/role-model.md`, `docs/decisions/project-room.md`
- **V2 code paths to study during /architecture and /backend:**
  - `apps/web/app/layout.tsx` — V2's basic global nav (already exists)
  - `apps/web/app/projects/[id]/page.tsx` — V2's tab-based project room
  - `apps/api/src/projektplattform_api/auth/dependencies.py` — `_require_read`, `_require_edit`, `_require_lead`, `_require_admin` patterns
  - `db/migrations/versions/0005_*` (project_memberships table)

## User Stories
- **[V2 EP-02-ST-01]** As a user, I want a clear global primary navigation so that I can reach platform-wide areas (Projects, Master Data, Connectors, Reports, Settings) from any page.
- **[V2 EP-02-ST-02]** As a user, I want a project-scoped secondary navigation that appears when I open a project so that I can use project-specific modules (Backlog, Planning, Stakeholders, etc.) separately from global areas.
- **[V2 EP-02-ST-03]** As an operator, I want defined platform roles (`admin`, `member`, `viewer`) and project roles (`project_lead`, `project_editor`, `project_viewer`) so that rights and responsibilities are cleanly separated.
- **[V2 EP-02-ST-04]** As the system, I want to enforce role-based visibility and edit logic so that users only see and modify content their role permits — at both the UI and the API/RLS layer.

## Acceptance Criteria

### Global navigation
- [ ] Top-level nav contains at minimum: Projekte, Stammdaten (Master Data), Konnektoren, Reports, Einstellungen.
- [ ] The active section is visually marked.
- [ ] Nav is visible on every authenticated page.
- [ ] Items the current role cannot access are hidden (e.g. `viewer` does not see Konnektoren admin link).
- [ ] Nav is full on desktop, collapsible on small viewports.

### Project secondary navigation
- [ ] Opening a project shows a second nav layer below or beside the global nav.
- [ ] Project nav is visually distinct from global nav.
- [ ] Project nav shows only modules relevant to the current project (modules can be hidden by project type/method/active modules — see PROJ-6, PROJ-17).
- [ ] Default tabs: Übersicht, Planung, Backlog, Stakeholder, Mitglieder, Historie, Einstellungen (matches V2 ADR `project-room.md`).
- [ ] Tab state survives via URL (`?tab=…`) so links are bookmarkable.

### Project roles (new entity beyond PROJ-1's tenant roles)
- [ ] New table `project_memberships` with `tenant_id`, `project_id`, `user_id`, `role` (`project_lead | project_editor | project_viewer`), `created_at`. Unique on `(project_id, user_id)`.
- [ ] When a user creates a project, they automatically become `project_lead`.
- [ ] A `tenant_admin` does NOT need an explicit `project_memberships` row — tenant-admin status grants all-project access.
- [ ] Project role helper functions: `is_project_member(project_id)`, `has_project_role(project_id, role)`, `is_project_lead(project_id)`.

### RBAC enforcement (UI + API + RLS)
- [ ] A user without project access cannot open the project (404 to avoid existence leaks; 403 only after access is established).
- [ ] A user without module access does not see the module's nav entry.
- [ ] A user without edit rights cannot save changes (UI hides edit affordances, API rejects with 403).
- [ ] UI and API rights never contradict each other.
- [ ] RLS policies on every project-scoped table check both tenant membership AND (where applicable) project membership.

## Edge Cases
- **`tenant_admin` accessing a project they're not a member of** → succeeds (admin override). Verify both UI and RLS allow it.
- **`tenant_member` who is `project_lead` on project A and `project_viewer` on project B** → must see both, edit only A.
- **`tenant_viewer` (read-only at tenant level)** → can browse projects (sees them all in lists) but every write attempt fails closed.
- **Last project_lead removed/demoted** → blocked at API layer with clear error; DB trigger blocks as defense in depth (mirrors PROJ-1's last-admin guard).
- **Cross-tenant project access attempt** → 404, never 403 (no existence leak).
- **Deleted user's `project_memberships` rows** → cascade-delete via FK constraint.
- **User has tenant role `member` but no `project_memberships` row** → cannot read the project (Wave 1 D-P2 may want `tenant_member` to see all tenant projects; final policy to be confirmed during /architecture; record an ADR for V3).

## Technical Requirements
- **Stack:** Next.js 16 (App Router middleware + Server Components for nav), Tailwind, shadcn/ui (`NavigationMenu`, `Sheet` for mobile drawer, `Tabs` for project room).
- **Multi-tenant:** Every new table (`project_memberships`) MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS policies use `is_tenant_member(tenant_id)` + project-membership helpers.
- **Validation:** Zod schemas for the few API endpoints that manage project memberships.
- **Auth:** Supabase Auth (existing), session via `@supabase/ssr`.
- **RLS strategy:** Combine PROJ-1's `is_tenant_member` with new `is_project_member`/`has_project_role` helpers. All tenant-scoped tables fail closed by default.
- **Performance:** Project nav data (membership + role) cached per request via React Server Components.

## Out of Scope (deferred or explicit non-goals)
- Field-level permissions (no per-field visibility/edit rules in V3 MVP).
- UI for inviting users to projects via the project nav (covered later by PROJ-17 admin UI).
- Full SSO/OIDC.
- Approval workflows / delegation logic.

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
