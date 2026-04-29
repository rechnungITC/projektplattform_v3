# Stand-alone Deployment Guide

> Owner: PROJ-3 · Last updated: 2026-04-29

This guide describes how to run V3 on customer-managed infrastructure
("stand-alone mode") instead of the default multi-tenant SaaS deployment.
The same codebase serves both topologies — only configuration differs.

## When to use

Run stand-alone when an enterprise customer needs:

- their own isolated database (regulatory / data-sovereignty requirements);
- their own LLM environment (local Ollama, on-prem GPU, no external calls);
- their own update cadence, decoupled from the SaaS roadmap.

If those constraints don't apply, use the SaaS deployment — it's simpler
to operate and gets feature updates immediately.

## Architectural shape

| Layer | SaaS (default) | Stand-alone |
|---|---|---|
| App | Vercel Next.js (auto-deploys from `main`) | Self-hosted Next.js (Vercel-compatible runtime, or Node) or Vercel + customer subdomain |
| Database | Supabase managed Postgres + Auth | Self-hosted Supabase (`supabase/cli`-driven Docker stack) or customer-managed Postgres + Auth provider |
| Tenants | Many | Exactly one |
| External AI | Allowed (subject to PROJ-12 class-3 rules) | Optionally disabled via `EXTERNAL_AI_DISABLED=true` |
| Update cadence | Continuous (auto-deploy on push to `main`) | Customer-controlled (`git pull` + apply migrations + redeploy) |

Same codebase, no V3 forks. The differences are entirely env-driven.

## Required environment variables

All of these go into the customer's `.env` (or their secret manager). Do
not prefix with `NEXT_PUBLIC_` unless explicitly noted.

```env
# Supabase / Postgres
NEXT_PUBLIC_SUPABASE_URL=https://supabase.customer.tld
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service-role key>      # IMPORTANT: secret

# Operation mode
OPERATION_MODE=standalone                         # PROJ-3
EXTERNAL_AI_DISABLED=true                         # PROJ-3, optional

# Cron — required for retention + wizard-drafts purge
CRON_SECRET=<32+ char random string>

# Sentry — strongly recommended for ops visibility (optional but useful)
NEXT_PUBLIC_SENTRY_DSN=...
SENTRY_DSN=...
```

A `.env.local.example` is shipped in the repo with all keys and inline
documentation.

## Initial setup (one-time)

1. **Provision Postgres + Supabase Auth.** Either run self-hosted
   Supabase (`supabase init && supabase start`, then point your domain
   at the proxy) or use customer-managed Postgres with a compatible Auth
   layer. For self-hosted Supabase, the Studio UI behaves identically to
   the hosted version.
2. **Apply all migrations in order.** From `supabase/migrations/` — every
   `*.sql` file in lexicographic order. Use the Supabase CLI:
   `supabase db push`. Verify the tables: `risks`, `decisions`,
   `open_items`, `audit_log_entries`, `stakeholders`, `work_items`,
   `phases`, `milestones`, `projects`, `tenants`, `tenant_memberships`,
   `project_memberships`.
3. **Seed the single tenant.** Insert one row in `tenants` and one
   matching `tenant_memberships` row for the bootstrap admin user.
4. **Deploy the app.** Build with `npm ci && npm run build`. Run with
   `npm start` behind a reverse proxy (HTTPS terminator). Vercel works
   too if the customer chooses Vercel as their host.
5. **Smoke test.**
   - Sign in as the bootstrap admin.
   - Create a project. Verify it appears.
   - Open a project — Risiken / Entscheidungen / Stakeholder tabs render.
   - Confirm the TenantSwitcher does NOT render in the top nav (only the
     tenant name as a static label).
   - If `EXTERNAL_AI_DISABLED=true`, confirm via app logs that no LLM
     calls are attempted (PROJ-12 will surface a UI banner once that
     feature lands).

## Updates

See [update-strategy.md](./update-strategy.md) for the ordered procedure
on every release.

## Backups & restore

See [backup-restore.md](./backup-restore.md) for backup, point-in-time
recovery, and cold-restore procedures.

## Differences from SaaS — at a glance

| Concern | SaaS | Stand-alone |
|---|---|---|
| Tenant onboarding | New row in `tenants` via admin UI | One-time seed during initial setup; never expanded |
| Auth provider | Supabase Auth (hosted) | Supabase Auth (self-hosted) or customer SSO; configured in Supabase Studio |
| TenantSwitcher | Visible when user is in 2+ tenants | Always hidden (forced by `OPERATION_MODE=standalone`) |
| Updates | Automatic on push to `main` | Customer-driven; see update-strategy.md |
| Monitoring | Supabase Dashboard + Sentry | Customer-chosen Postgres monitoring + Sentry (DSN optional) |
| AI providers | Anthropic + Vercel AI Gateway by default | Customer choice. `EXTERNAL_AI_DISABLED=true` to block all external calls. |
| Billing | Per-tenant on the SaaS plan | Out of scope (commercial license / support contract) |

## Connector framework (PROJ-14)

The connector framework (PROJ-14 plumbing slice) introduces an
encrypted credential store at `public.tenant_secrets`, decrypted only
in the API layer.

### Required env-var

| Var | Required for | Without it |
|---|---|---|
| `SECRETS_ENCRYPTION_KEY` | `/konnektoren` UI + per-tenant credential pflege | Every editable connector reports `error: encryption_unavailable`; tenant credentials cannot be written. Existing env-var-based defaults (RESEND_API_KEY, ANTHROPIC_API_KEY) keep working. |

Generate any 32+ char random string and store it as a server secret in
Vercel + Supabase. Never prefix `NEXT_PUBLIC_`.

### Connector status enum

The registry reports one of:

- `adapter_missing` — code-level stub, real adapter not yet shipped (Jira, MCP in this slice).
- `adapter_ready_unconfigured` — code shipped, no credentials set.
- `adapter_ready_configured` — credentials present (env or tenant_secret).
- `error` — configured but health probe failed (e.g. `encryption_unavailable`).

A stand-alone deployment that runs entirely on-prem can have every
external connector either `adapter_missing` or `adapter_ready_unconfigured`
and still operate the platform. Only the affected surfaces (real email
send, real KI vs stub) degrade.

### Credential precedence

`tenant_secrets` (per-tenant, encrypted) > env vars > stub fallback.
Env-only defaults are convenient for stand-alone deployments where
there's exactly one tenant; SaaS deployments prefer per-tenant secrets
because they survive deploys and are auditable.

### Rotating the encryption key

Currently a manual operation:

1. Add the new key as `SECRETS_ENCRYPTION_KEY_NEW` in env.
2. Run a one-shot SQL job that decrypts every row in `tenant_secrets`
   with the OLD key and re-encrypts with NEW.
3. Swap `SECRETS_ENCRYPTION_KEY` to the new value; redeploy.

A scheduled-rotation surface (UI + admin RPC) is a follow-up slice.
For MVP, rotation is rare and manual.

## What's not in scope

- A productized one-click installer.
- A migration tool to move a tenant between SaaS and stand-alone.
- Hot-standby / streaming replication (use Supabase WAL archive).
- Auto-scaling, SLA tiers, managed monitoring stack.

These are explicit non-goals from the PROJ-3 spec. Customers needing
them today should stay on SaaS.
