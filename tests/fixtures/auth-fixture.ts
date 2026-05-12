import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { test as base, type Page } from "@playwright/test"

import { E2E_STORAGE_STATE_PATH } from "./constants"

/**
 * Returns true when `globalSetup` provisioned a usable storage state
 * (Supabase SSR auth cookie). Returns false when SUPABASE_SERVICE_ROLE_KEY
 * was missing/invalid and globalSetup wrote an empty fallback. Tests using
 * this fixture should `test.skip()` accordingly.
 */
export function hasAuthStorageState(): boolean {
  const path = resolve(process.cwd(), E2E_STORAGE_STATE_PATH)
  if (!existsSync(path)) return false
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      cookies?: { name?: unknown; value?: unknown }[]
    }
    return Boolean(
      parsed.cookies?.some(
        (cookie) =>
          typeof cookie.name === "string" &&
          /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/.test(cookie.name) &&
          typeof cookie.value === "string" &&
          cookie.value.length > 0,
      ),
    )
  } catch {
    return false
  }
}

/**
 * PROJ-29 Block C — Playwright fixture for an authenticated page.
 *
 * Usage in a spec:
 *   import { test, expect } from "../fixtures/auth-fixture"
 *   test("the AppShell renders past the auth gate", async ({ authenticatedPage }) => {
 *     await authenticatedPage.goto("/")
 *     await expect(authenticatedPage.locator("[data-sidebar='sidebar']").first()).toBeVisible()
 *   })
 *
 * The fixture loads the storage state produced by `globalSetup` so the
 * test starts already-logged-in as the [E2E] test user (UUID + tenant
 * pinned in `constants.ts`).
 *
 * The 38 pre-existing unauth E2E tests are unaffected — they keep
 * importing `@playwright/test` directly and never see this fixture.
 */
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ browser }, use) => {
    if (!hasAuthStorageState()) {
      // Defensive: if globalSetup couldn't provision auth (invalid env,
      // missing browser binary, etc.), skip the test cleanly instead of
      // crashing the browser launch.
      base.skip(
        true,
        "Auth fixture not provisioned — see tests/fixtures/README.md " +
          "(needs valid SUPABASE_SERVICE_ROLE_KEY in .env.local).",
      )
      return
    }
    const context = await browser.newContext({
      storageState: E2E_STORAGE_STATE_PATH,
    })
    const page = await context.newPage()
    await use(page)
    await context.close()
  },
})

export { expect } from "@playwright/test"
