import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { test as base, type Browser, type Page } from "@playwright/test"

import {
  E2E_ASSISTANT_TENANT_ID,
  E2E_STORAGE_STATE_PATH,
  E2E_TENANT_ID,
} from "./constants"

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
/**
 * PROJ-Y-144d — pin the active workspace explicitly.
 *
 * The E2E user is now a member of TWO tenants (the shared one and the
 * assistant one). Without a cookie, `resolveActiveTenantId` falls back to the
 * *earliest* `tenant_memberships` row — and on a freshly seeded environment
 * both rows are created in the same second, so that ordering is a coin flip.
 * Every existing `authenticatedPage` spec would then be one race away from
 * rendering a different workspace.
 *
 * So both fixtures set `active_tenant_id`. The cookie is not a trust boundary:
 * the resolver re-validates membership server-side on every request and returns
 * null (→ 403) for a tenant the user does not belong to (PROJ-55-α/ε).
 */
async function pinnedContext(
  browser: Browser,
  tenantId: string,
  baseURL: string | undefined,
) {
  const context = await browser.newContext({
    storageState: E2E_STORAGE_STATE_PATH,
  })
  await context.addCookies([
    {
      name: "active_tenant_id",
      value: tenantId,
      url: baseURL ?? "http://localhost:3000",
      sameSite: "Lax",
    },
  ])
  return context
}

function skipUnlessProvisioned(): boolean {
  if (hasAuthStorageState()) return false
  // Defensive: if globalSetup couldn't provision auth (invalid env,
  // missing browser binary, etc.), skip the test cleanly instead of
  // crashing the browser launch.
  base.skip(
    true,
    "Auth fixture not provisioned — see tests/fixtures/README.md " +
      "(needs valid SUPABASE_SERVICE_ROLE_KEY in .env.local).",
  )
  return true
}

export const test = base.extend<{
  authenticatedPage: Page
  /**
   * PROJ-Y-144d — signed in with the ASSISTANT tenant active, where the
   * assistant module is on and the seed project runs Scrum. Use this for the
   * PROJ-144 chain; `authenticatedPage` deliberately stays on a tenant where
   * the assistant is off, so the visual-regression baselines keep rendering a
   * shell without the launcher button.
   */
  assistantTenantPage: Page
}>({
  authenticatedPage: async ({ browser, baseURL }, use) => {
    if (skipUnlessProvisioned()) return
    const context = await pinnedContext(browser, E2E_TENANT_ID, baseURL)
    const page = await context.newPage()
    await use(page)
    await context.close()
  },

  assistantTenantPage: async ({ browser, baseURL }, use) => {
    if (skipUnlessProvisioned()) return
    const context = await pinnedContext(
      browser,
      E2E_ASSISTANT_TENANT_ID,
      baseURL,
    )
    const page = await context.newPage()
    await use(page)
    await context.close()
  },
})

export { expect } from "@playwright/test"
