# Update Strategy

> Owner: PROJ-3 · Last updated: 2026-04-29

V3 is one codebase serving two deployment topologies (SaaS and
stand-alone). The update procedure is identical in spirit; only the
operator differs.

## Ordered procedure (every release)

The order is load-bearing — schema must be ahead of code, never behind.

1. **Apply Supabase migrations.**
   - `supabase db push` from `supabase/migrations/` (or use the
     Supabase Dashboard SQL editor for stand-alone Studio installs).
   - Migrations are written backward-compatible: old code keeps working
     against the new schema. This is what makes the rolling deploy safe.
2. **Deploy Edge Functions** (if the release includes any).
   - `supabase functions deploy <name>` per affected function.
   - V3 today ships zero Edge Functions; SQL functions / RPCs in the
     migrations file cover the same scope.
3. **Deploy the Next.js app.**
   - SaaS: push to `main`, Vercel auto-deploys.
   - Stand-alone: `git pull && npm ci && npm run build && npm start`
     (or whatever process supervisor the customer runs).
4. **Flip feature flags as needed.**
   - V3 currently has no feature flags beyond the boot-time env vars.
     If any are added later (e.g. via GrowthBook), they get toggled
     after the new code is live.

## Backward-compatible migrations

A migration is backward-compatible if old code keeps working against
the new schema during the rolling window between step 1 and step 3.

✅ Backward-compatible:
- Adding a new table.
- Adding a new column with a default (or nullable).
- Adding a new index.
- Adding a CHECK constraint that all existing rows already satisfy.
- Adding a new RPC.

❌ Not backward-compatible (needs a multi-step plan):
- Dropping a column the live app reads.
- Renaming a column (deploy the rename in two steps: add new, dual-write,
  cut over, drop old).
- Tightening a CHECK constraint on existing data.
- Changing a function signature in a way that breaks live callers.

When a migration is not backward-compatible, split it into two releases:
release N adds the new shape and writes to both, release N+1 drops the
old shape after the dual-write window.

## Rollback

V3 has two rollback layers:

### App rollback (one click on Vercel)

Vercel Dashboard → Deployments → previous good deployment → "Promote
to Production". Takes ~30 seconds. The previous build serves
immediately. **Schema must already support both old and new code** —
this is why migrations are backward-compatible.

For stand-alone: `git checkout <previous tag> && npm ci && npm run
build && npm start`. Equivalent operation, manual.

### Schema rollback (rare)

Supabase doesn't run automatic down-migrations. Each migration in this
repo carries either:

- **No down-step** — the change is purely additive and rolling back app
  code is sufficient (the new column / table just goes unused).
- **An explicit recovery procedure documented in the migration file**
  — required when the change isn't reversible by app rollback alone
  (e.g. PROJ-20's `decisions_immutability_trigger` would need an
  explicit DROP TRIGGER + DROP FUNCTION sequence to reverse).

Schema rollback is significantly more disruptive than app rollback;
prefer to roll forward with a fix.

## Pre-deploy sanity check

Before every release, verify locally:

```sh
git status                           # working tree clean
ls supabase/migrations/              # any new migrations the customer needs
npm run build                        # production build succeeds
npx vitest run                       # unit + route tests pass
npx tsc --noEmit                     # type-check clean
```

The CI pipeline (Vercel + GitHub Actions if the customer wires one)
runs the same set on every push.

## Stand-alone-specific concerns

- **Migration drift.** If a customer skips a release, their schema will
  trail. Always apply migrations sequentially; the file order in
  `supabase/migrations/` defines the order. The Supabase CLI tracks
  applied migrations via the `supabase_migrations.schema_migrations`
  table — it won't re-apply already-applied migrations.
- **Vendored vs hosted Supabase Studio.** If the customer self-hosts
  Studio, the SQL editor still works for ad-hoc inspection but
  migrations should always go through the CLI to keep the migration
  ledger correct.

## SaaS-specific concerns

- **Auto-deploy on push.** `main` is protected; only Approved feature
  branches get merged. PR reviews catch backward-compat regressions.
- **Preview deployments** on Vercel run the same build path; smoke-test
  on a preview before merging if the migration is non-trivial.
- **Multiple regions** — V3 runs in a single Vercel region tied to the
  Supabase region (`eu-west-1`). Multi-region is out of scope for now.
