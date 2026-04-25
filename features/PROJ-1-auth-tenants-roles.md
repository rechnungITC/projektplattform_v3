# PROJ-1: Authentication, Tenants, and Role-Based Membership

## Status: Planned
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Summary
The foundational identity, tenancy, and authorization layer for the platform. Every other feature (projects, phases, tasks, etc.) depends on tenant scoping and role-based access control built here.

## Dependencies
- None (this is the first feature)

## User Stories

### Authentication
- As a new user, I want to sign up with my email and password so that I can access the platform.
- As a returning user, I want to log in via email and password so that I can resume work.
- As a logged-in user, I want to log out so that my session ends and the device is no longer authenticated.
- As a user who forgot my password, I want to request a password reset link so that I can regain access.

### Tenant assignment (self-service + domain-routed)
- As a new user with an email at a **claimed** domain (e.g. `@firma.de`), I want to be auto-joined to that tenant as a `member` so that I'm immediately part of my organization without admin intervention.
- As a new user with an email at an **unclaimed** domain, I want a fresh tenant created with me as `admin` so that I can start using the platform without setup overhead.
- As a tenant admin, I want to claim my organization's email domain so that future signups from that domain auto-join my tenant.

### Role-based access control (admin / member / viewer)
- As a tenant `admin`, I want to invite other users to my tenant via email so that I can grow my team.
- As a tenant `admin`, I want to assign or change a member's role (admin / member / viewer) so that I can control who does what.
- As a tenant `admin`, I want to revoke a user's membership so that I can remove ex-employees or wrong invitations.
- As a tenant `member`, I want full read/write access to tenant content within my role's bounds so that I can do my work.
- As a tenant `viewer`, I want read-only access to tenant content so that I can stay informed without risk of accidental changes.

## Acceptance Criteria

### Authentication
- [ ] Email/password signup works via Supabase Auth (`auth.users`)
- [ ] Email/password login works
- [ ] Logout terminates the session
- [ ] Password reset via Supabase Auth flow (magic link)
- [ ] Session persists across reloads (Supabase client + cookies)
- [ ] Unauthenticated users are redirected to `/login` for protected routes

### Tenancy data model
- [ ] `tenants` table: `id` (UUID PK), `name` (text NOT NULL), `domain` (text, nullable, **unique when not null**), `created_at`, `created_by` (FK profiles)
- [ ] `profiles` table (mirror of `auth.users` for app data): `id` (UUID PK = auth.users.id), `email`, `display_name`, `created_at`, `updated_at`
- [ ] `tenant_memberships` table: `id`, `tenant_id` (FK), `user_id` (FK profiles), `role` (text with `CHECK (role IN ('admin','member','viewer'))`), `created_at`. Unique constraint on `(tenant_id, user_id)`.
- [ ] RLS enabled on `tenants`, `profiles`, `tenant_memberships`

### Tenant assignment on signup (trigger or post-signup edge function)
- [ ] On signup, the system extracts the email domain
- [ ] If a tenant exists with `tenants.domain = <signup domain>`, a `tenant_memberships` row is created with role `member`
- [ ] If no tenant claims that domain, a new tenant is created (`name` = derived from domain or user input) and a membership row is created with role `admin`
- [ ] In both cases, a `profiles` row is created/updated for the new auth user

### Domain claim
- [ ] An admin can claim a domain by setting `tenants.domain` (only admins of that tenant)
- [ ] DB-level uniqueness prevents two tenants from claiming the same domain
- [ ] Claiming a domain does NOT migrate existing users from other tenants (out of scope for MVP)
- [ ] A claimed domain can be cleared (set to NULL) by an admin

### Invite flow
- [ ] An admin can invite a user via email (uses Supabase Auth invite)
- [ ] On invitation acceptance, a `tenant_memberships` row is created for that user with the role chosen by the inviter (default: `member`)
- [ ] Invites bypass the domain-routing rule (an explicit invite always wins)

### Role enforcement (RLS policies)
- [ ] All tenant-scoped tables filter rows where `tenant_id = (current user's tenant)`
- [ ] `admin` role allows full CRUD on tenant data
- [ ] `member` role allows CRUD on tenant data EXCEPT membership management (no role changes, no invites, no domain claims)
- [ ] `viewer` role allows SELECT only — no INSERT/UPDATE/DELETE on tenant content

### Role management
- [ ] Admin can change another user's role within the same tenant
- [ ] Admin can revoke a membership (deletes the `tenant_memberships` row)
- [ ] **Tenant must always have at least one admin** — last admin demotion or removal is blocked at the DB or app layer

## Edge Cases

- **First admin lock-in.** Last admin demotes themselves or removes themselves → blocked. Tenant must always have ≥1 admin.
- **Invite to user who already belongs to another tenant.** Allowed: a single user can have memberships in multiple tenants. The UI exposes a tenant switcher.
- **Domain conflict.** Two admins try to claim the same domain → second one fails with a clear error (DB unique constraint).
- **Pre-existing user, post-claim.** Admin claims `@firma.de` after user `alice@firma.de` already signed up to a different tenant. Alice is NOT migrated. Alice's existing tenant stays as-is. (Cross-tenant migration is out of scope for MVP.)
- **Disposable / freemail signup.** No special handling — `gmail.com`, `outlook.com`, etc. are treated like any unclaimed domain (each signup creates its own tenant). Listing freemail domains as "never claimable" is a P1 enhancement.
- **Email change post-signup.** User changes email from `@a.com` to `@b.com` → tenant memberships are NOT re-evaluated. Membership stays with the original tenant unless explicitly changed.
- **Auth user deleted, membership orphaned.** `tenant_memberships.user_id` has `ON DELETE CASCADE` → membership is removed when the auth user is deleted.
- **Viewer attempts a write.** RLS blocks the operation; API returns 403.
- **Member tries to invite.** Blocked at the API layer (only admins); RLS policy on `tenant_memberships` INSERT enforces it as the second line of defense.
- **Tenant has no name.** Required field — signup flow must produce a name (default: derived from email domain like "firma.de", user can rename after signup).

## Technical Requirements

### Database
- All tenant-scoped tables use a `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` column
- RLS policies use a Postgres function like `auth.tenant_id()` or `is_member_of_tenant(tenant_id, role)` for reuse across tables
- `tenant_memberships.role` enforced via DB CHECK constraint, not Postgres ENUM (easier to extend)

### Auth
- Supabase Auth with email/password provider only for MVP (no OAuth, no magic-link-only)
- Sessions managed by `@supabase/ssr` package for Next.js App Router

### Performance
- Signup flow completes in < 2s end-to-end
- Login flow < 1s

### Security
- Domain claim requires authenticated admin
- No anonymous tenant creation API — only via the signup flow
- DNS-based domain ownership verification is **out of scope for MVP** (admin trust model). Documented as known limitation; revisit when the platform has real adversarial users.
- All RLS policies fail closed (deny by default; explicit grants per role)

### Out of Scope (deferred to later features)
- Single Sign-On (SSO/SAML/OIDC)
- Two-factor authentication (2FA)
- Cross-tenant user migration
- Audit log of role changes (P1 — covered later by a generic audit feature)
- DNS-based domain ownership proof

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
