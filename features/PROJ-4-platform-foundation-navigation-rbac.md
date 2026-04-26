# PROJ-4: Platform Foundation — Navigation, Project Roles, RBAC Enforcement

## Status: Architected
**Created:** 2026-04-25
**Last Updated:** 2026-04-26

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

PROJ-4 builds the application shell **and** introduces the second role layer (project-level roles). Most of the database schema is pre-defined by ADR [`v3-project-memberships-schema.md`](../docs/decisions/v3-project-memberships-schema.md); the navigation patterns follow ADR [`project-room.md`](../docs/decisions/project-room.md). This section concretizes how those decisions plug into the existing PROJ-1 / PROJ-2 codebase.

### A) Component Structure (UI)

```
App Shell                                       (extended from PROJ-1)
├── TopNav
│   ├── Brand "Projektplattform"
│   ├── Primary nav row
│   │   ├── Projekte           (live, links to /projects)
│   │   ├── Stammdaten         (stub → /stammdaten "coming soon")
│   │   ├── Konnektoren        (stub, admin-only visibility → /konnektoren)
│   │   ├── Reports            (stub → /reports)
│   │   └── Einstellungen      (live, /settings)
│   ├── Tenant Switcher        (unchanged from PROJ-1)
│   └── User Menu              (unchanged)
│
├── /projects                  ← list page (already in PROJ-2; nav highlights "Projekte")
│
├── /projects/[id]             ← project room
│   ├── ProjectHeader          (unchanged from PROJ-2)
│   ├── ProjectSecondaryNav    NEW — sub-tabs row below the global nav
│   │   ├── Übersicht          → /projects/[id]                 (live; current detail page becomes this tab)
│   │   ├── Planung            → /projects/[id]/planung         (stub for PROJ-19)
│   │   ├── Backlog            → /projects/[id]/backlog         (stub for PROJ-9)
│   │   ├── Stakeholder        → /projects/[id]/stakeholder     (stub for PROJ-8)
│   │   ├── Mitglieder         → /projects/[id]/mitglieder      NEW (project_memberships UI)
│   │   ├── Historie           → /projects/[id]/historie        (live — full lifecycle history)
│   │   └── Einstellungen      → /projects/[id]/einstellungen   (project-level settings, future)
│   └── <tab content slot>     each tab is its own Next.js segment
│
├── /stammdaten, /konnektoren, /reports         placeholder pages with friendly "Coming soon — tracked in PROJ-X" messaging
│
└── (existing /settings/* tabs from PROJ-1 stay; "Projects Trash" tab unchanged)
```

**Path-based tabs (not query-string).** Next.js App Router segments give us free SSR + breadcrumbs + per-tab metadata + clear deep links. The single-page-with-`?tab=` approach would have been client-side switching only — worse for SEO, sharing, and bookmarking.

### B) Data Model

One new table; three new RLS helper functions; backfill of existing projects.

#### `project_memberships` (per ADR `v3-project-memberships-schema.md`)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `project_id` | UUID NOT NULL FK projects ON DELETE CASCADE | |
| `user_id` | UUID NOT NULL FK profiles ON DELETE RESTRICT | preserve audit when profile is deleted |
| `role` | TEXT CHECK (`lead`, `editor`, `viewer`) | three project-level roles |
| `created_by` | UUID NOT NULL FK profiles | who added this membership |
| `created_at` | TIMESTAMPTZ | |
| `UNIQUE (project_id, user_id)` | | one membership per user per project |
| Indexes | `(project_id)`, `(user_id)` | |

**Triggers:**
- BEFORE INSERT/UPDATE: `enforce_project_membership_user_in_tenant` — `user_id` must be a member of `projects.tenant_id` (analogous to PROJ-2's responsible-user guard).
- BEFORE UPDATE OF role / BEFORE DELETE: `enforce_last_lead` — last `lead` of a project cannot be demoted or removed (mirrors PROJ-1's last-admin pattern).

#### Helper functions

Three new SECURITY DEFINER + STABLE + hardened search_path functions:

| Function | Returns | Used by |
|---|---|---|
| `is_project_member(p_project_id)` | bool | RLS SELECT policies on project-scoped tables (later PROJs) |
| `has_project_role(p_project_id, p_role)` | bool | RLS write policies + UI gating |
| `is_project_lead(p_project_id)` | bool | thin wrapper, RLS policies for sensitive operations |

**Tenant-admin shortcut** is built into the helpers: if the caller is `is_tenant_admin(projects.tenant_id)`, the helpers return true regardless of `project_memberships`. That keeps PROJ-2's RLS policies short and gives the tenant admin universal access without needing explicit `project_memberships` rows.

#### Migration sequencing

`supabase/migrations/20260426100000_proj4_project_memberships.sql` runs after PROJ-2's last migration. Sections in order:
1. Create `project_memberships` table + indexes
2. Define helper functions + grants to `authenticated`
3. Create cross-tenant + last-lead triggers
4. Enable RLS + policies on `project_memberships`
5. **Backfill**: insert one row per existing project — `(project_id, user_id=responsible_user_id, role='lead', created_by=responsible_user_id)`. Without this, the existing "ERP Projekt" project would have no leads and become un-editable when the next step lands.
6. Update PROJ-2 RLS policies (DROP + CREATE) to use the new project-level checks.

### C) PROJ-2 RLS Policies — Update Plan

Today (PROJ-2 backend):

| Operation | Predicate |
|---|---|
| `projects` SELECT | `is_tenant_member(tenant_id)` |
| `projects` INSERT | `is_tenant_admin OR has_tenant_role('member')` |
| `projects` UPDATE | `is_tenant_admin OR has_tenant_role('member')` |
| `projects` DELETE | `is_tenant_admin` |

After PROJ-4:

| Operation | Predicate | Reasoning |
|---|---|---|
| `projects` SELECT | `is_tenant_member(tenant_id)` | unchanged — every tenant member sees the project list (consistent with V2 ADR `sprint-1-product-open-points.md` D-P2: "all projects visible to authenticated users") |
| `projects` INSERT | `is_tenant_admin OR has_tenant_role('member')` | unchanged — creating a project is a tenant-level right |
| `projects` UPDATE | `is_tenant_admin OR has_project_role(id, 'lead') OR has_project_role(id, 'editor')` | tightened — tenant_member who is not on the project's membership list cannot edit master data |
| `projects` DELETE (hard) | `is_tenant_admin` | unchanged |

The `transition_project_status` function and the soft-delete API are upgraded similarly:
- **Lifecycle transitions**: only `is_project_lead` (or `is_tenant_admin`) — editors can edit master data but not move state
- **Soft-delete (`is_deleted = true`)**: only `is_project_lead` (or `is_tenant_admin`) — same as transitions
- These distinctions live in the **API route** (admin-pre-check via shared helper), not in RLS, because Postgres RLS cannot easily distinguish "set is_deleted" from "edit name" in one UPDATE policy. The DB UPDATE policy stays at "lead or editor"; the API zod-schema-and-pre-check enforces the finer split.

### D) Auto-Lead on Project Create

Decision: **API-route logic, not a DB trigger** (per ADR `v3-project-memberships-schema.md`).

In `POST /api/projects` the route runs (in one Postgres transaction via Supabase RPC or chained statements):
1. INSERT into `projects`
2. INSERT into `project_memberships` with `role='lead'`, `user_id = auth.uid()`, `created_by = auth.uid()`

Why not a trigger:
- Explicit and easy to read — no hidden mutation when reading the route handler
- Easy to skip in tests that need a project without an auto-lead
- A trigger would also make backfill more complex (the backfill itself would re-trigger and try to insert duplicates)

The same pattern applies to bulk-creation flows in the future (e.g., import). Each path is responsible for ensuring at least one `lead`. The DB last-lead trigger is the safety net.

### E) AuthContext / Frontend Hooks

Extend `useAuth` (PROJ-1) and add new hooks:

| Hook | Returns | Source |
|---|---|---|
| `useAuth()` | `{ user, profile, currentTenant, currentRole, memberships }` | unchanged from PROJ-1 |
| `useProjectRole(projectId)` | `'lead' \| 'editor' \| 'viewer' \| null` | new — fetches the row from `project_memberships` for current user; if `tenant_admin`, returns `'lead'` (admin equivalence) |
| `useProjectAccess(projectId, action)` | `boolean` | new — derived: `action='read'` → any tenant member; `action='edit_master'` → admin/lead/editor; `action='transition'` → admin/lead; `action='delete_hard'` → tenant_admin only |
| `useProjectMembers(projectId)` | `Array<ProjectMembership & { profile }>` | new — for the Mitglieder tab UI |

Components reuse existing PROJ-1 patterns: AuthProvider hydrates initial role/membership server-side; client hooks read from context where possible to avoid re-fetching.

### F) Member Management UI (`/projects/[id]/mitglieder`)

```
Mitglieder Tab Page
├── Header
│   ├── "X members in this project"
│   └── [Add member] button     (project_lead OR tenant_admin only)
├── Member Table (shadcn Table)
│   ├── Avatar + display_name + email
│   ├── Role Badge (Lead / Editor / Viewer)
│   └── Actions menu             (lead OR tenant_admin: change role, remove)
└── Empty state                  (only true for cross-tenant projects; usually impossible — there's always at least the lead)

Dialogs:
├── AddProjectMemberDialog
│   ├── User picker — lists tenant_memberships not yet on this project
│   ├── Role select — lead / editor / viewer
│   └── Submit → POST /api/projects/[id]/members
├── ChangeProjectRoleDialog
│   └── Role select — last-lead client-side guard via useProjectMembers
└── RemoveProjectMemberDialog (AlertDialog)
    └── Confirm — last-lead guard surfaced as 422 if it slips past UI
```

The "User picker" subtree relies on the existing `useTenantMembers` hook from PROJ-1 (filtered to exclude users already on this project).

### G) RBAC Enforcement — Three Layers

| Layer | What | Where |
|---|---|---|
| **UI hide** | Don't render the button/route a user can't use | `useProjectAccess` gating in components |
| **API pre-check** | 401 / 403 / 404 with clear message before doing the work | shared helpers in `src/app/api/_lib/route-helpers.ts` (existing) get extended with `requireProjectAccess(projectId, action)` |
| **RLS** | Last line of defense — even if API logic has a bug, the database refuses | new policies on `project_memberships` and updated policies on `projects` |

**Error mapping (the 404 vs 403 distinction):**
- **Cross-tenant access** (user not in the project's tenant) → 404 from the API route, regardless of operation. The project's existence is hidden from non-members. RLS makes the row invisible; the route returns "not found".
- **Same-tenant, no project_membership, project exists** → 200 SELECT works (tenant member can see the list), but write attempts return 403 with a clear "you need project_lead/editor for this action" message.
- **No auth** → 401, redirect to /login (handled by middleware, unchanged from PROJ-1).

### H) Global Navigation Stubs

For each nav section that's not yet implemented:

| Section | Route | Status | Future PROJ-X |
|---|---|---|---|
| Projekte | `/projects` | live | — |
| Stammdaten | `/stammdaten` | stub page | PROJ-8 (Stakeholders), PROJ-15 (Vendors), PROJ-16 (Master Data UI) — landing page later lists subsections |
| Konnektoren | `/konnektoren` | stub page, **admin-only nav visibility** | PROJ-14 |
| Reports | `/reports` | stub page | future Output domain — TBD via PROJ-7 architecture |
| Einstellungen | `/settings` | live | — |

Each stub renders a small Card explaining: "This area becomes available with feature PROJ-X. We'll automatically enable it when ready."

### I) New / Updated API Routes

| Route | Purpose | New / Updated |
|---|---|---|
| `POST /api/projects/[id]/members` | add a member with a role | NEW |
| `PATCH /api/projects/[id]/members/[userId]` | change role | NEW |
| `DELETE /api/projects/[id]/members/[userId]` | remove membership (last-lead guard) | NEW |
| `POST /api/projects` | create — also writes auto-lead row | UPDATED (transactional second INSERT) |
| `PATCH /api/projects/[id]` | update — pre-check `requireProjectAccess(id, 'edit_master')` | UPDATED |
| `POST /api/projects/[id]/transition` | pre-check `requireProjectAccess(id, 'transition')` | UPDATED (current 403 mapping kept; pre-check rejects earlier with helpful message) |
| `DELETE /api/projects/[id]` | soft-delete pre-check `requireProjectAccess(id, 'transition')`; hard-delete path unchanged | UPDATED |

All membership routes are admin-or-lead-gated and return 422 when the last-lead trigger blocks an action.

### J) Tech Decisions Justified

| Decision | Why |
|---|---|
| Path-based tabs instead of `?tab=` | Better Next.js DX (real segments + per-tab metadata + RSC streaming), better URLs |
| API-route auto-lead instead of DB trigger | Explicit, debuggable, doesn't fight backfill |
| Tenant-admin equivalence baked into helper functions | Keeps RLS policies short and avoids needing an explicit `project_memberships` row for tenant admins |
| Separate `is_project_lead` helper | Hot-path check — used by lifecycle transition, soft-delete, member management; avoids passing role string everywhere |
| Backfill via SQL in the same migration | Single transaction; no risk of an in-between state where the policy update lands without leads existing |
| 404 (not 403) for cross-tenant access | Standard zero-leak pattern — non-members can't probe project existence |
| `responsible_user_id` retained alongside `project_memberships` | Different concept: responsibility (who owns it) vs access (who can act on it) — see ADR § Verhältnis section |

### K) Migration / Apply Plan

1. Apply `20260426100000_proj4_project_memberships.sql` (table + helpers + triggers + policies + backfill + PROJ-2 policy update)
2. Verify backfill: every existing project has ≥1 `lead` row in `project_memberships`
3. Verify RLS update on `projects` doesn't break the existing user's access (their existing project should now have them as `lead` and full edit capability)
4. Frontend ships in same release as the migration — no UI relies on the new helpers until rendered

### L) Out of Scope (deferred)

- Module-level visibility rules (`tenant_disabled_modules` per ADR `metamodel-infra-followups.md`) — covered by PROJ-17
- Drag-and-drop reordering of nav items — none required
- Per-project deep-link permissions UI (e.g., "this tab requires project_editor") in a settings panel — UI reflects access via hide/show, no admin page for it
- Audit log of role changes — picked up by PROJ-10 (Change Management)
- SSO / external IdP — separate future work

### M) Trade-offs Acknowledged

| Trade-off | Chosen | Why okay |
|---|---|---|
| Auto-lead via API (not trigger) | API-route handles it | One creation path; backfill safety; trigger is non-trivial to coexist with backfill |
| Tenant_admin bypass in helpers | Helpers return true for admins | Keeps policies readable; admin role is sparingly assigned |
| Multi-segment URL for tabs | Path-based, not query-string | One more file per tab, but better DX and SEO outweigh the cost |
| Soft-delete and lifecycle gated at API, not RLS | API enforces the lead-only rule for these specific updates | RLS can't easily distinguish "set is_deleted" from "edit name" without column-level policies; API-layer enforcement is the readable path |

## Implementation Notes
_To be added by /frontend and /backend_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
