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
