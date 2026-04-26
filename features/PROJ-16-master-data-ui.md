# PROJ-16: Master Data UI — Users, Stakeholder Rollup, Project Type & Method Catalog Overrides

## Status: Planned
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
Tenant-admin UI for editing master data without shell access: invite/manage users + memberships, tenant-wide read-only stakeholder rollup, project-type catalog overrides (additive deltas to code defaults), and method catalog enable/disable toggles. Inherits V2 EP-14.

## Dependencies
- Requires: PROJ-1 (Auth, Tenants, Roles)
- Requires: PROJ-4 (Platform Foundation: RBAC + project memberships)
- Requires: PROJ-6 (Project Type / Method catalog) — overrides target this
- Requires: PROJ-8 (Stakeholders) — rollup view aggregates these
- Requires: PROJ-13 (Email send for invites)

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-14-stammdaten-pflege.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-14.md` (ST-01 user UI, ST-02 stakeholder rollup, ST-03 project-type override, ST-04 method override)
- **V2 code paths to study during /architecture and /backend:**
  - `apps/web/app/stammdaten/benutzer/`, `stakeholder/`, `projekttypen/`, `methoden/`
  - `apps/api/src/projektplattform_api/routers/tenant_members.py`

## User Stories
- **[V2 EP-14-ST-01]** As a tenant admin, I want to invite users, set their tenant role, and deactivate users without DB access.
- **[V2 EP-14-ST-02]** As a tenant admin or PMO, I want a tenant-wide read-only stakeholder list with project participation so I see who is involved where.
- **[V2 EP-14-ST-03]** As a tenant admin, I want to extend or override project-type defaults (standard roles, required info, document templates) per tenant.
- **[V2 EP-14-ST-04]** As a tenant admin, I want to enable/disable methods for the tenant so my "no SAFe here" policy is enforced platform-wide.

## Acceptance Criteria

### User UI (ST-01)
- [ ] Page `/stammdaten/benutzer` (admin only).
- [ ] Invite a user (email + initial role) creates the auth user (Supabase Auth admin invite) and the tenant_membership row.
- [ ] List shows current tenant members: email, role, status, last login (if available), created_at.
- [ ] Inline role change.
- [ ] Deactivate a member: soft-delete the tenant_membership row, log to audit.
- [ ] Last admin protection (mirrors PROJ-1 invariant).
- [ ] Invite goes via PROJ-13 outbox channel.

### Stakeholder rollup (ST-02)
- [ ] Page `/stammdaten/stakeholder` (admin/PMO only).
- [ ] Tenant-wide list of all stakeholders, joined to their project list (one row per stakeholder, list of projects).
- [ ] Group/sort by role, org unit, influence.
- [ ] Filter active/inactive, role, org unit.
- [ ] **Read-only** — no edits at this scope (per V2 ADR `stakeholder-vs-user.md`); edits stay project-scoped (PROJ-8).
- [ ] CSV export.

### Project-type override (ST-03)
- [ ] Page `/stammdaten/projekttypen` (admin only).
- [ ] List shows code-defined types (read-only base) with editable override layer.
- [ ] New table `tenant_project_type_overrides`: `tenant_id, type_key, overrides (JSONB), updated_by, updated_at`.
- [ ] Allowed override fields whitelisted: `standard_roles`, `required_info`, `document_templates`. NOT `type_key` or structural metadata.
- [ ] "Inherited" badges on fields not overridden.
- [ ] "Reset to default" button per field.
- [ ] Audit on all changes.

### Method override (ST-04)
- [ ] Page `/stammdaten/methoden` (admin only).
- [ ] List shows methods with `enabled` toggles per tenant.
- [ ] Override stored in `tenant_method_overrides` (`tenant_id, method_key, enabled`).
- [ ] Disabled methods hidden in wizard (PROJ-5).
- [ ] Existing projects on a now-disabled method continue working untouched.
- [ ] At least one method must remain enabled.
- [ ] Audit on changes.

## Edge Cases
- **Self-demotion of the last tenant_admin** → blocked (DB trigger + API check).
- **Override added then default code value changes** → if user explicitly overrode, override stays; if "inherited", new default applies.
- **Disabling all methods** → blocked (422).
- **Cross-tenant view of stakeholder rollup** → RLS blocks.
- **Member with multiple memberships across tenants** → each tenant's UI shows only its own row.
- **Invite to an email that already has an auth.users row** → uses existing user, just adds the membership.
- **Override deleted while a project uses it** → project keeps its current state; future references resolve to base default.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase, shadcn/ui (`Table`, `Sheet`, `Form`, `Switch`, `DropdownMenu`).
- **Multi-tenant:** All override tables MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS: tenant_admin only.
- **Validation:** Zod schemas; whitelist enforcement on override JSONB.
- **Auth:** Supabase Auth + tenant_admin role check.
- **Audit:** PROJ-10 hooks for every change.

## Out of Scope (deferred or explicit non-goals)
- Free creation of brand-new project types via UI (still code-delivery only).
- Free method definition.
- Tenant-wide stakeholder edit (stays per-project per ADR).
- SSO/OIDC.
- Self-service signup.
- Free role definition (roles are still enum-fixed in PROJ-1/PROJ-4).

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
