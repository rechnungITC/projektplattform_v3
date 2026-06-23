# Playwright fixtures

PROJ-29 Block C introduces a logged-in fixture so future specs can test
authenticated UI surfaces. The 38 pre-existing E2E tests are unauth and
keep using plain `@playwright/test`.

## Files

- `constants.ts` — pinned UUIDs/email/password for the `[E2E]` test tenant + user.
- `global-setup.ts` — runs once per test run; upserts the test tenant + user via Supabase admin API and writes a Playwright `storageState` to `.auth/storage-state.json` (gitignored).
- `auth-fixture.ts` — exports `test` + `expect` extended with an `authenticatedPage` fixture that hydrates from the storage state.

## Required env vars

`globalSetup` reads from `.env.local` (or pre-set env in CI):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:
- `PLAYWRIGHT_BASE_URL` — defaults to `http://localhost:3000`.

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
