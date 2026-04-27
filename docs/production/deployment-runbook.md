# Deployment Runbook — V3 First Production Release

> Practical, step-by-step guide for the first production deployment of
> Projektplattform V3 to Vercel + the live Supabase project.
> Everything in this doc is **interactive** — must be done by a human with
> the right credentials.

## Prerequisites

- Vercel account with access to the target Vercel team / personal scope
- GitHub access to the V3 repository (for the auto-deploy connection)
- Supabase Dashboard access to project `iqerihohwabyjzkpcujq` (eu-west-1)
- Local `.env.local` containing the working Supabase URL + anon key + service-role key

## Phase 1 — push the code

```bash
# Confirm we are on main and ahead of origin
git status -sb

# Push the commits we want to deploy
git push origin main
```

After this, GitHub holds the latest commits; Vercel will see them once linked.

## Phase 2 — connect the Vercel project (one-time)

```bash
npx vercel login        # authenticate via browser
cd /path/to/projektplattform_v3
npx vercel link         # creates .vercel/ — pick "Link to existing" if there is one,
                        # otherwise create a new project. Framework = Next.js (auto-detected).
```

If you prefer the dashboard: <https://vercel.com/new> → import the GitHub repo.

When the wizard asks for build settings, accept the auto-detected ones.
Do **not** set environment variables via the CLI — see Phase 3.

## Phase 3 — environment variables in Vercel

In **Vercel Dashboard → Project → Settings → Environment Variables**, add the
three required vars. All three are needed for **Production**, **Preview**, and
**Development** environments.

| Name | Where to find | Public? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API → Project URL | yes (browser) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API → anon public | yes (browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → service_role secret | **NO — secret** |

⚠️ **`SUPABASE_SERVICE_ROLE_KEY` is a secret.** Never expose it client-side.
It's used by `src/app/api/projects/[id]/route.ts` (DELETE hard-delete branch)
to bypass RLS for tenant-admin actions. Vercel encrypts the value at rest;
do not paste it into a CI log or a screenshot.

After adding the vars, trigger a redeploy from the dashboard — Vercel does
not retroactively apply new env vars to a running deployment.

## Phase 4 — first deploy

Either:
- Push another commit to `main` (auto-deploys), or
- Click "Redeploy" in the dashboard, or
- Run `npx vercel --prod` from the local repo

Watch the build log; it should finish in ~2 minutes.

## Phase 5 — production smoke tests

Open the production URL and walk through:

1. `/login` loads
2. Sign in with the existing user (`info@it-couch.de`)
3. Project list shows the 3 existing projects
4. Click into one project → project room loads
5. `/api/project-types` returns the catalog (use the browser address bar)
6. `/api/projects/[id]/rules` returns rules for an existing project
7. Backlog tab loads work-items and sprints
8. Browser DevTools → Network → check response headers on any HTML response:
   - `X-Frame-Options: DENY` ✓
   - `X-Content-Type-Options: nosniff` ✓
   - `Referrer-Policy: origin-when-cross-origin` ✓
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains` ✓
   - `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()` ✓
9. DevTools → Console: no red errors
10. Vercel Dashboard → Logs: no `function_duration` outliers, no 500s

If anything fails, see "Rollback" below.

## Phase 6 — post-deploy bookkeeping

```bash
# After the production URL is verified, tag the release
git tag -a v0.1.0-mvp-backbone -m "MVP backbone: PROJ-1, 2, 4, 6, 7, 9, 19"
git push origin v0.1.0-mvp-backbone
```

Update each Approved feature spec with a "Deployment" section noting:
- Date deployed
- Production URL
- Git tag
- Any deviations encountered

Update `features/INDEX.md` — flip the status of all deployed features
to `Deployed`.

## Phase 7 — production-ready essentials (recommended after first deploy)

These are not blocking the first deploy but should land in week one:

1. **Error tracking** — Sentry. See `docs/production/error-tracking.md`.
   Approx. 5 min of work. Adds two `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_AUTH_TOKEN`
   env vars.
2. **Lighthouse pass** — run against the production URL. Target ≥ 90 in all
   four categories. See `docs/production/performance.md`.
3. **Rate limiting** on the auth endpoints — see `docs/production/rate-limiting.md`.
   Optional today; required if non-employee users sign up.
4. **CSP header** — security-headers.md notes this is the most fragile;
   start with `Content-Security-Policy-Report-Only` to find violations
   before flipping to enforcing mode.
5. **Auth leaked-password protection** — Supabase Dashboard → Authentication →
   Settings → enable "Leaked password protection" (HaveIBeenPwned check). One
   click. Removes the standing advisor warning.

## Rollback

If production breaks:

1. **Fastest path:** Vercel Dashboard → Deployments → previous-good build →
   "Promote to Production" (~30 seconds, no code changes).
2. **Code fix:** revert or fix locally, `npm run build`, commit, push — Vercel
   auto-deploys the fix.
3. **DB rollback:** there is no automatic DB rollback. If a migration broke
   things, write a forward-fixing migration. Never edit applied migrations
   in place.

## What's intentionally not in this runbook

- **Multi-environment promotion (dev → staging → prod)** — V3 has only one
  Supabase environment today. Stage/prod separation is a follow-up.
- **Custom domain.** Vercel's `*.vercel.app` URL is fine for the first ship.
- **CI/CD beyond Vercel auto-deploy.** GitHub Actions is not configured;
  Vercel-on-push is the deployment trigger.
