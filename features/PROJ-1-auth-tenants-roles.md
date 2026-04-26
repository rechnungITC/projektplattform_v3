# PROJ-1: Authentication, Tenants, and Role-Based Membership

## Status: In Progress
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

### A) Component Structure (UI)

```
Marketing/Public
├── /login                   ← email + password form
├── /signup                  ← email + password + display_name
├── /forgot-password         ← request reset email
└── /reset-password          ← set new password (from email link)

App (authenticated)
├── /onboarding              ← shown ONCE after signup if user is sole admin of fresh tenant
│   └── Tenant naming form (default: derived from email domain)
│
├── Top Nav
│   ├── Tenant Switcher      ← dropdown if user belongs to multiple tenants
│   └── User Menu            ← profile + logout
│
└── /settings
    ├── /settings/profile          ← display_name, password change (any role)
    ├── /settings/tenant           ← rename tenant, manage domain claim (admin only)
    └── /settings/members          ← list members, invite, change role, revoke (admin only)
```

All forms reuse existing shadcn components (`Form`, `Input`, `Label`, `Button`, `Dialog`, `DropdownMenu`, `Table`).

### B) Data Model

Three new tables in Supabase Postgres. All have RLS enabled.

**`tenants`** — one row per organization
- `id` — unique identifier
- `name` — display name (required)
- `domain` — optional claimed email domain (e.g. `firma.de`); unique across all tenants when set
- `created_at`, `created_by` — audit

**`profiles`** — one row per authenticated user (mirrors Supabase's built-in `auth.users` but holds app-specific fields)
- `id` — same UUID as the corresponding `auth.users` row
- `email` — synced from auth.users
- `display_name` — user-editable
- `created_at`, `updated_at`

Why a separate `profiles` table: Supabase's built-in `auth.users` is restricted (limited columns, can't be referenced by foreign keys directly in user code). The standard pattern is a public `profiles` mirror for app data and FK references.

**`tenant_memberships`** — links users to tenants with a role
- `id` — unique identifier
- `tenant_id` — which tenant
- `user_id` — which user (FK to profiles)
- `role` — `admin`, `member`, or `viewer` (DB CHECK constraint)
- `created_at`
- Unique constraint on `(tenant_id, user_id)` — a user has at most one membership per tenant
- A user CAN have memberships in multiple tenants (cross-tenant membership is valid)

### C) Key Flows

**Signup → Tenant Assignment** (the single most important flow)

```
User submits signup form
        │
        ▼
Supabase Auth creates row in auth.users
        │
        ▼ (Auth Hook fires)
Edge Function setup-tenant-on-signup (Deno + TypeScript):
    1. Receive auth event payload (user_id, email, user_metadata)
    2. Insert/upsert profile row (id = auth.users.id, email, display_name)
    3. If user_metadata.invited_to_tenant present:
         → INSERT membership with that tenant_id and metadata.invited_role
       Else (self-service signup):
         → Extract domain from email
         → SELECT tenant WHERE domain = <signup domain>
              ├── Match found → INSERT membership (role='member')
              └── No match    → INSERT new tenant (name='<domain>')
                                INSERT membership (role='admin')
    4. Return success; log structured event for observability
```

Why Edge Function (not DB trigger): keeps tenant-routing logic in TypeScript so it's easier to evolve, debug, and integrate with MCP tools later. Edge Functions fit the V3 stack principle ("Supabase-native, no Python services") and are observable in Supabase logs.

**Atomicity safeguard:** Edge Functions are not strictly transactional with the `auth.users` insert. The Edge Function uses a Postgres transaction internally (`profiles` insert + `tenants` upsert + `tenant_memberships` insert in one BEGIN/COMMIT), so within the function it's all-or-nothing. If the hook itself fails (timeout, network issue), a fallback **on-login check** runs: if a logged-in user has no `tenant_memberships` row, the same setup logic runs lazily before granting access. Users are never able to use the app without a tenant assignment — they just see a one-time "Setting up your workspace…" loader on first login if the hook missed.

**Login**
- Supabase Auth handles credential check + session cookie issuance
- `@supabase/ssr` package wires the session into Next.js Server Components and Route Handlers
- After login, the app reads the user's tenant memberships and shows a switcher if more than one

**Invite Flow** (admin invites a user)
1. Admin enters email + chooses role on `/settings/members`
2. App calls `supabase.auth.admin.inviteUserByEmail(email, { data: { invited_to_tenant: <id>, invited_role: <role> } })`
3. Supabase sends magic-link email
4. Recipient clicks link → lands on `/reset-password` (sets initial password) → auth.users row created
5. Same `handle_new_user` trigger fires; sees `invited_to_tenant` in `user_metadata` → uses that instead of domain logic

**Role Change**
- Admin clicks "Change role" on member list → API call to `PATCH /api/tenants/{id}/members/{userId}` with `{ role: 'member' }`
- API checks: caller is admin of this tenant; target user belongs to tenant; if demoting last admin, reject (with helpful message)
- DB trigger `enforce_admin_invariant` ALSO blocks the same scenario — defense in depth (in case API check is bypassed)

**Revoke Membership**
- Admin clicks "Remove" → `DELETE /api/tenants/{id}/members/{userId}`
- API + trigger both enforce: cannot remove the last admin

### D) Authorization Strategy (RLS)

RLS is the **single source of truth** for who can read or write what. The frontend cannot bypass it; if the policy says no, the row doesn't appear.

**Three reusable Postgres helper functions** the policies build on:
1. `is_tenant_member(tenant_id)` — returns true if the current user belongs to the given tenant in any role
2. `has_tenant_role(tenant_id, role)` — returns true if the current user has the specific role
3. `is_tenant_admin(tenant_id)` — convenience wrapper for `has_tenant_role(t, 'admin')`

**Policy strategy per table:**

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `tenants` | member of tenant | only via signup trigger (no direct insert) | admin only | never (delete via cascade only) |
| `profiles` | self + members of shared tenants | via signup trigger | self only | via auth.users cascade |
| `tenant_memberships` | members of same tenant | admin only | admin only | admin only |

**Why membership-based RLS, not JWT custom claim:** A JWT tenant claim would be faster but requires a "switch tenant" flow that re-issues the JWT and adds infrastructure. Membership-based RLS is simpler for MVP, lets users see all their tenants without switching, and is plenty fast at MVP scale. We can introduce a JWT claim later if performance demands it.

**Active-tenant UX:** The frontend tracks the user's currently-selected tenant in app state (e.g., a context provider, persisted to a cookie). This is a UI scoping concern — RLS does not enforce a single active tenant, only membership.

### E) Constraint Enforcement

**"Tenant must always have ≥1 admin"** — enforced at TWO layers:

1. **API layer** (nice errors): role-change and membership-delete endpoints check the count first; reject with 422 + clear message
2. **DB trigger layer** (hard guarantee): `BEFORE UPDATE OF role` and `BEFORE DELETE` on `tenant_memberships` count remaining admins; raise exception if 0

The DB trigger is the security guarantee. The API check is for nice UX (better error message before hitting the trigger).

### F) API Surface (Next.js App Router)

These are the **only** custom API routes needed; everything else uses Supabase Auth client SDKs directly from the browser.

```
POST   /api/tenants/{id}/invite           ← admin invites a user
PATCH  /api/tenants/{id}                  ← rename tenant or set/clear domain
PATCH  /api/tenants/{id}/members/{userId} ← change role
DELETE /api/tenants/{id}/members/{userId} ← revoke membership
```

Why Route Handlers instead of pure client-side calls? Because invites involve admin-only Supabase API calls that need the service-role key (must stay server-side). Role changes also benefit from a single trusted spot for the admin-count pre-check.

### G) Session Handling

- **Library:** `@supabase/ssr` (Supabase's official Next.js helper). Manages cookies for both Server Components and Client Components transparently.
- **Middleware:** A Next.js middleware runs on every request, refreshes the session cookie if needed, and redirects unauthenticated users away from protected routes.
- **Server Components** read `auth.uid()` from the request cookie via the helper; **Client Components** use the Supabase JS client.

### H) Tech Decisions Justified

| Decision | Why |
|---|---|
| Email/password (not magic link) for MVP | Familiar UX; doesn't require email infrastructure tuning. Magic link is a P1 add-on. |
| Separate `profiles` table mirroring `auth.users` | Standard Supabase pattern; `auth.users` cannot be FK-referenced by app tables directly and is restricted from app SQL. |
| Edge Function for tenant routing (not DB trigger) | TypeScript over plpgsql — easier to evolve, debug, and observe. Aligns with V3's "Supabase-native, no extra services" principle and leaves room for MCP integration. Atomicity gap mitigated by an on-login fallback. |
| `role` as TEXT + CHECK (not Postgres ENUM) | Easier to add new roles later (just update CHECK; ENUM requires `ALTER TYPE`). Same DB-level safety. |
| `domain` UNIQUE WHERE NOT NULL (partial index) | Allows multiple tenants with NULL domain (most users); enforces uniqueness only when set. |
| Membership-based RLS (not JWT claim) | Simpler MVP; users transparently see all their tenants. Performance-tune to JWT-claim later only if needed. |
| Role mgmt via Next.js Route Handlers | Some operations need the service-role key; can't be client-side. |
| Last-admin guard at DB + API | Defense in depth; DB trigger is hard truth, API check provides UX. |

### I) Dependencies (npm packages)

| Package | Purpose |
|---|---|
| `@supabase/supabase-js` | Already installed — Supabase client SDK |
| `@supabase/ssr` | Cookie-based session handling for Next.js App Router |
| `react-hook-form` | Already installed — auth forms |
| `zod` | Already installed — input validation |
| `@hookform/resolvers` | Already installed — bridges zod to react-hook-form |

No new dependencies beyond `@supabase/ssr`. Everything else is already in the starter kit.

### J) What's NOT Designed Here (deferred)

These are explicitly **out of scope** for PROJ-1 implementation but architecturally accommodated:

- **DNS-based domain verification** — admin currently claims domain on trust. Future: DNS TXT record verification flow.
- **SSO/SAML** — would require an additional Supabase Auth provider configuration. Schema doesn't change.
- **2FA** — Supabase Auth supports it natively; can be enabled later without schema change.
- **Cross-tenant migration** — manual SQL operation for now; productize later if demand justifies.
- **Audit log of role changes** — bigger generic audit feature later (not specific to memberships).

### K) Trade-offs to Acknowledge

| Trade-off | Chosen direction | Why okay for MVP |
|---|---|---|
| Trust-based domain claim | Anyone with admin role can claim any unclaimed domain | Internal/early users; adversarial model not yet relevant |
| Last-write-wins for tenant rename | No optimistic concurrency | Tenant settings change rarely; conflicts unlikely |
| All-tenants visibility (no JWT claim) | User's queries can fan out across multiple tenant memberships | At MVP scale (single-digit tenants per user), performance fine |
| Single auth provider | Email/password only | Lowest setup cost; OAuth/SSO can be added later without schema change |
| Edge Function tenant-routing (not DB-trigger atomicity) | Hook may rarely miss; on-login fallback covers the edge case | Cost of TypeScript + observability outweighs the tiny non-atomicity window |

## Implementation Notes (Frontend)

Frontend done; build green, TypeScript clean.

**Files created:**
- Foundation: `src/lib/supabase/{client,server,middleware}.ts`, `src/proxy.ts` (Next 16.2 deprecates `middleware.ts` filename), `src/lib/auth-helpers.ts`, `src/types/auth.ts`
- Providers: `src/components/theme-provider.tsx` (next-themes), root layout wires `ThemeProvider` + sonner `<Toaster />`
- Auth pages in `src/app/(auth)/`: `login`, `signup`, `forgot-password`, `reset-password` + shared `(auth)/layout.tsx`
- Onboarding: `src/app/onboarding/` polls `tenant_memberships` for the new user, then offers tenant rename
- App shell in `src/app/(app)/`: protected layout, top-nav with `TenantSwitcher` + `UserMenu`, dashboard placeholder at `/`
- Settings: `/settings/profile`, `/settings/tenant` (admin), `/settings/members` (admin; invite, change role, revoke; last-admin client-side guard)
- Hooks: `src/hooks/use-auth.tsx`, `use-tenant-memberships.ts`, `use-tenant-members.ts`

**Deviations from design:**
- `middleware.ts` → `proxy.ts` (Next 16.2 rename; same behavior)
- Active tenant persisted in `active_tenant_id` cookie (1y, samesite=lax, non-HttpOnly — UI hint, not a security boundary). Readable client- and server-side, survives reloads.
- Auth pages redirect signed-in users to `/`.

**Backend stubs (will 404 until /backend lands):**
- `POST /api/tenants/{id}/invite`, `PATCH /api/tenants/{id}/members/{userId}`, `DELETE /api/tenants/{id}/members/{userId}` — UI handles 404 with `toast.warning("…endpoint pending implementation")`.

**Known gaps to address during /backend:**
- `npm run lint` cannot run: starter kit ships ESLint 9 + legacy `.eslintrc.json`; needs flat-config migration. Pre-existing infra issue, not caused by this work.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` must be in `.env.local` to connect.
- Backend Supabase migrations + RLS policies + Edge Function for tenant routing are next.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
