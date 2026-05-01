import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { expect, test } from "./fixtures/auth-fixture"
import { E2E_STORAGE_STATE_PATH } from "./fixtures/constants"

/**
 * PROJ-29 Block C — smoke test for the logged-in Playwright fixture.
 *
 * The 38 unauth specs verify that authenticated routes 307 to /login.
 * This spec verifies the antithesis: with the fixture's storage state,
 * the AppShell renders past the auth gate. Subsequent feature specs
 * (PROJ-21 PDF render, future feature E2E) can layer on top.
 *
 * Module-level skip: when globalSetup wrote an empty storage state
 * (invalid SUPABASE_SERVICE_ROLE_KEY etc.), skip the entire describe
 * block before any browser is launched. The unauth suites keep
 * running; this smoke unblocks once the env is valid.
 */
function hasAuthState(): boolean {
  const path = resolve(process.cwd(), E2E_STORAGE_STATE_PATH)
  if (!existsSync(path)) return false
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      origins?: { localStorage?: unknown[] }[]
    }
    return Boolean(parsed.origins?.[0]?.localStorage?.length)
  } catch {
    return false
  }
}

test.describe("PROJ-29 / auth-fixture smoke", () => {
  test.skip(
    !hasAuthState(),
    "Auth fixture not provisioned — see tests/fixtures/README.md (needs valid SUPABASE_SERVICE_ROLE_KEY in .env.local).",
  )

  test("an authenticated request reaches the AppShell (no /login bounce)", async ({
    authenticatedPage,
  }) => {
    const response = await authenticatedPage.goto("/", {
      waitUntil: "domcontentloaded",
    })
    expect(response?.status()).toBeLessThan(400)
    expect(authenticatedPage.url()).not.toMatch(/\/login(\?|$)/)
  })
})
