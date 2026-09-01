import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { test as base, type Browser, type Page } from "@playwright/test"

import {
  E2E_ASSISTANT_TENANT_ID,
  E2E_CHAT_TENANT_ID,
  E2E_CONSTRUCTION_LEAD_STORAGE_STATE_PATH,
  E2E_CONSTRUCTION_TENANT_ID,
  E2E_CONSTRUCTION_VIEWER_STORAGE_STATE_PATH,
  E2E_GANTT_TENANT_ID,
  E2E_STORAGE_STATE_PATH,
  E2E_TENANT_ID,
  E2E_VISUAL_STORAGE_STATE_PATH,
  E2E_VISUAL_TENANT_ID,
} from "./constants"

/**
 * Returns true when `globalSetup` provisioned a usable storage state
 * (Supabase SSR auth cookie). Returns false when SUPABASE_SERVICE_ROLE_KEY
 * was missing/invalid and globalSetup wrote an empty fallback. Tests using
 * this fixture should `test.skip()` accordingly.
 */
export function hasAuthStorageState(
  relativePath: string = E2E_STORAGE_STATE_PATH,
): boolean {
  const path = resolve(process.cwd(), relativePath)
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
  storageStatePath: string = E2E_STORAGE_STATE_PATH,
) {
  const context = await browser.newContext({
    storageState: storageStatePath,
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

function skipUnlessProvisioned(
  relativePath: string = E2E_STORAGE_STATE_PATH,
): boolean {
  if (hasAuthStorageState(relativePath)) return false
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
  /**
   * PROJ-Y-151b — signed in with the CHAT tenant active, where `ai_chat` is on
   * and the seed project is a waterfall ERP project with a description (the
   * chat grounds its answer in it).
   *
   * Own tenant for the same reason as the assistant lane: the module adds a
   * project-room tab, and the visual specs photograph the shell `fullPage`.
   */
  chatTenantPage: Page
  /**
   * PROJ-Y-143l — signed in as the visual lane's OWN user, in the visual
   * lane's own tenant. Used exclusively by
   * `PROJ-51-visual-regression-authenticated.spec.ts`.
   *
   * The point is negative: this identity has exactly one membership and is not
   * touched by any other slice, so no foreign slice's account bookkeeping —
   * a second tenant, a role change, a renamed profile, a toggled module,
   * branding — can move the baselines. `authenticatedPage` deliberately keeps
   * the shared user for every other authenticated spec.
   */
  visualPage: Page
  /**
   * PROJ-Y-155a — signed in with the GANTT tenant active: a waterfall project
   * whose phases, WBS tree and one dependency are all date-pinned.
   *
   * Reuses the SHARED user's storage state and only re-pins the tenant (the
   * assistant/chat pattern), which costs no extra sign-in. That is safe here
   * for a reason the other visual lane did not have: the Gantt capture is
   * scoped to the diagram element, so no account state — display name,
   * membership count, branding — can reach the baseline.
   */
  ganttTenantPage: Page
  /**
   * PROJ-45-β `/qa` — the three seats of the defect chain, all in the
   * construction tenant (own tenant so no module has to be toggled on a shared
   * one; PROJ-Y-143f/143l).
   *
   * `constructionAdminPage` reuses the SHARED user's storage state and only
   * re-pins the active tenant — the shared identity is the tenant admin here,
   * so the lane costs two extra sign-ins instead of three.
   */
  constructionAdminPage: Page
  /** Project `lead`, tenant `member` — reports the defect done. */
  constructionLeadPage: Page
  /** Project `viewer`, tenant `member` — may only create (L15). */
  constructionViewerPage: Page
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

  chatTenantPage: async ({ browser, baseURL }, use) => {
    if (skipUnlessProvisioned()) return
    const context = await pinnedContext(browser, E2E_CHAT_TENANT_ID, baseURL)
    const page = await context.newPage()
    await use(page)
    await context.close()
  },

  visualPage: async ({ browser, baseURL }, use) => {
    if (skipUnlessProvisioned(E2E_VISUAL_STORAGE_STATE_PATH)) return
    const context = await pinnedContext(
      browser,
      E2E_VISUAL_TENANT_ID,
      baseURL,
      E2E_VISUAL_STORAGE_STATE_PATH,
    )
    const page = await context.newPage()
    await use(page)
    await context.close()
  },

  ganttTenantPage: async ({ browser, baseURL }, use) => {
    if (skipUnlessProvisioned()) return
    const context = await pinnedContext(browser, E2E_GANTT_TENANT_ID, baseURL)
    const page = await context.newPage()
    await use(page)
    await context.close()
  },

  constructionAdminPage: async ({ browser, baseURL }, use) => {
    if (skipUnlessProvisioned()) return
    const context = await pinnedContext(
      browser,
      E2E_CONSTRUCTION_TENANT_ID,
      baseURL,
    )
    const page = await context.newPage()
    await use(page)
    await context.close()
  },

  constructionLeadPage: async ({ browser, baseURL }, use) => {
    if (skipUnlessProvisioned(E2E_CONSTRUCTION_LEAD_STORAGE_STATE_PATH)) return
    const context = await pinnedContext(
      browser,
      E2E_CONSTRUCTION_TENANT_ID,
      baseURL,
      E2E_CONSTRUCTION_LEAD_STORAGE_STATE_PATH,
    )
    const page = await context.newPage()
    await use(page)
    await context.close()
  },

  constructionViewerPage: async ({ browser, baseURL }, use) => {
    if (skipUnlessProvisioned(E2E_CONSTRUCTION_VIEWER_STORAGE_STATE_PATH))
      return
    const context = await pinnedContext(
      browser,
      E2E_CONSTRUCTION_TENANT_ID,
      baseURL,
      E2E_CONSTRUCTION_VIEWER_STORAGE_STATE_PATH,
    )
    const page = await context.newPage()
    await use(page)
    await context.close()
  },
})

export { expect } from "@playwright/test"
