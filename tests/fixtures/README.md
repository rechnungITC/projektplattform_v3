# Playwright fixtures

PROJ-29 Block C introduces a logged-in fixture so future specs can test
authenticated UI surfaces. The 38 pre-existing E2E tests are unauth and
keep using plain `@playwright/test`.

## Files

- `constants.ts` — pinned UUIDs/email/password for the `[E2E]` test tenant + user.
- `global-setup.ts` — runs once per test run; upserts the test tenant + user via Supabase admin API and writes a Playwright `storageState` to `.auth/storage-state.json` (gitignored).
- `auth-fixture.ts` — exports `test` + `expect` extended with an `authenticatedPage` fixture that hydrates from the storage state.

## Three identities, not one (PROJ-Y-143l)

| Fixture | Identity | Used by |
|---|---|---|
| `authenticatedPage` | `E2E_USER_ID` in `E2E_TENANT_ID` | every authenticated spec except the two below |
| `assistantTenantPage` | same user, `E2E_ASSISTANT_TENANT_ID` (assistant module on) | `PROJ-Y-144d-*` |
| `visualPage` | `E2E_VISUAL_USER_ID` in `E2E_VISUAL_TENANT_ID`, **one** membership | `PROJ-51-visual-regression-authenticated.spec.ts` only |

The visual lane is separate because its baselines photograph account and
tenant state — the workspace label, the profile e-mail, the tenant name and
domain, the module toggles. While that state was shared, a slice adding a
membership for its own purposes moved all seven images at once (PROJ-Y-143f,
F-1). **If you need a tenant with unusual settings, add your own identity to
`constants.ts` and seed it in `global-setup.ts`; do not reconfigure an
existing one.** `PROJ-Y-143l-visual-lane-isolation.spec.ts` fails with a
readable message if the visual lane picks up a second membership.

## Required env vars

`globalSetup` reads from `.env.local` (or pre-set env in CI):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:
- `PLAYWRIGHT_BASE_URL` — defaults to `http://localhost:3000`.

  Since PROJ-Y-143l this drives **all three** consumers: the runner's
  `use.baseURL`, the `webServer` URL, and the `PORT` the dev server binds.
  Before that only `globalSetup` read it, so setting it produced cookies
  pinned to one origin and pages fetched from another.

  Use it when a second session is active. `reuseExistingServer` is on outside
  CI, so whoever owns port 3000 serves *your* tests: a run of the visual spec
  was observed rendering a neighbouring worktree's feature into an otherwise
  green suite, intermittently, as the two servers raced for the port. A
  baseline taken in that state records code that is not on your branch.

  ```bash
  PLAYWRIGHT_BASE_URL=http://localhost:3210 npx playwright test
  ```

## Running

```bash
# Local (Playwright's webServer + globalSetup auto-run):
npm run test:e2e

# Force a storage-state regeneration (e.g. when JWT expires):
npm run test:e2e:setup
```

## Writing a logged-in spec

```ts
import { test, expect } from "../tests/fixtures/auth-fixture"

test("the AppShell renders for an authenticated user", async ({
  authenticatedPage,
}) => {
  await authenticatedPage.goto("/")
  await expect(
    authenticatedPage.locator("[data-sidebar='sidebar']").first()
  ).toBeVisible()
})
```

A canonical demo lives in `tests/PROJ-29-auth-fixture-smoke.spec.ts`.

## Idempotency

`globalSetup` is safe to run repeatedly:
- `auth.admin.createUser` swallows the "user already registered" error.
- `tenants` upsert is `onConflict: "id"`.
- `tenant_memberships` is delete-then-insert for the (tenant, user) pair.

## Test data hygiene

The `[E2E]` tenant lives in the same database as production tenants. RLS scopes regular user sessions to their own tenants, so a normal logged-in customer cannot see it. The tenant name + email + UUIDs are clearly synthetic; nothing personally identifiable is stored.

## Warm-compile & the wedged-dev-server failure mode (PROJ-138)

After auth provisioning, `globalSetup` warm-compiles the heavy deep-link routes once (PROJ-67 AC-9) so parallel workers don't all hit a cold first-compile at the same time. PROJ-138 hardened this so it can never hang the whole run before a test starts.

### Symptoms of a wedged dev server

A hard-killed Playwright `webServer` (e.g. a tool/CI timeout that SIGKILLs the run mid-first-compile) can leave a **deadlocked Turbopack compile worker**:

- the dev log shows `○ Compiling /projects ...` with **no completion line**,
- the `next-server` process sits at **~0% CPU** (it is not compiling — it is stuck),
- requests to not-yet-compiled routes **hang forever** (a 200s curl returns nothing),
- but unauthenticated routes (instant 307) and a **fresh** server are fine — the same route compiles in ~2s after a clean restart.

The next run reuses that wedged server (`reuseExistingServer: !CI`) and would hang in warm-compile. PROJ-138's preflight probe detects this and logs the remedy instead of hanging.

### Remedies (any one)

1. **`npm run test:e2e:fresh`** — kills the stray dev server on port 3000 (worktree-safe: only the `:3000` listener, never another session's server), clears `.next/dev`, then runs Playwright against a clean boot. Forwards args: `npm run test:e2e:fresh -- tests/PROJ-94-*.spec.ts`.
2. **Manual:** `pkill -9 -f next-server && rm -rf .next/dev && npm run dev`.
3. **Skip warm-compile** when it isn't needed: `PW_SKIP_WARM_COMPILE=1 npx playwright test ...` (also auto-skipped for serial `--workers=1` runs locally — warm-compile only guards against *parallel* contention).

### Tunables (env, all optional)

| Var | Default | Effect |
|---|---|---|
| `PW_SKIP_WARM_COMPILE=1` | off | skip warm-compile entirely (wins on CI too) |
| `PW_WARM_COMPILE_ROUTE_TIMEOUT_MS` | `30000` | per-route timeout (was a flat 120s) |
| `PW_WARM_COMPILE_BUDGET_MS` | `90000` | total wall-clock budget; remaining routes are skipped and **named** in the log |

Warm-compile is always **fail-open** — it never fails a test. It also fails fast: the preflight probe plus a 2-consecutive-timeout guard abort the pass instead of burning the full budget on a wedged server.
