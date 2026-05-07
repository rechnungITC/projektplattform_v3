/**
 * PROJ-51-ε.3 — Visual Regression baseline for authenticated pages.
 *
 * Continuation of `PROJ-51-visual-regression.spec.ts` (unauth pages).
 * Uses the PROJ-29 auth-fixture (`tests/fixtures/auth-fixture.ts`),
 * which logs the [E2E] test user in once via `globalSetup` and reuses
 * the storage state per test.
 *
 * Scope (top-level pages only): Dashboard, Projects list, Master Data
 * root + Resources, Settings root + Tenant settings. These pages render
 * deterministically with just the [E2E] tenant + admin membership that
 * `globalSetup` provisions — no project/risk/decision seeding required.
 *
 * Project-Room snapshots are deliberately deferred until a follow-up
 * slice introduces a fixed-UUID test project, because Project-Room
 * pages depend on `Date.now()`-derived timestamps and dynamic IDs that
 * cause unbounded diffs without seed pinning.
 *
 * The fixture self-skips if `globalSetup` could not provision auth
 * (missing/invalid `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`), so
 * this spec is a no-op on environments that don't have those secrets.
 */

import { expect, test } from "./fixtures/auth-fixture"

test.describe("PROJ-51-ε.3 — Visual Regression (authenticated)", () => {
  // Desktop-only: on mobile the sidebar collapses behind a hamburger,
  // changing the layout substantially. Mobile snapshots are a separate
  // follow-up that should target the mobile shell explicitly.
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Authenticated visual snapshots are pinned to desktop chromium for now.",
  )


  test("Dashboard renders past auth gate", async ({ authenticatedPage }) => {
    const response = await authenticatedPage.goto("/", {
      waitUntil: "domcontentloaded",
    })
    expect(response?.status()).toBeLessThan(400)
    // Wait for the AppShell sidebar — it's rendered once hydration
    // completes and is the most stable indicator of "fully loaded".
    await expect(
      authenticatedPage.locator("[data-sidebar='sidebar']").first(),
    ).toBeVisible()
    await expect(authenticatedPage).toHaveScreenshot("dashboard.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    })
  })

  test("Projects list page", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/projects", {
      waitUntil: "domcontentloaded",
    })
    await expect(
      authenticatedPage.locator("[data-sidebar='sidebar']").first(),
    ).toBeVisible()
    await expect(authenticatedPage).toHaveScreenshot("projects-list.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    })
  })

  test("Master Data root", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/stammdaten", {
      waitUntil: "domcontentloaded",
    })
    await expect(
      authenticatedPage.locator("[data-sidebar='sidebar']").first(),
    ).toBeVisible()
    await expect(authenticatedPage).toHaveScreenshot("stammdaten.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    })
  })

  test("Resources page", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/stammdaten/resources", {
      waitUntil: "domcontentloaded",
    })
    await expect(
      authenticatedPage.locator("[data-sidebar='sidebar']").first(),
    ).toBeVisible()
    await expect(authenticatedPage).toHaveScreenshot(
      "stammdaten-resources.png",
      {
        maxDiffPixelRatio: 0.02,
        fullPage: true,
      },
    )
  })

  test("Settings root", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/settings", {
      waitUntil: "domcontentloaded",
    })
    await expect(
      authenticatedPage.locator("[data-sidebar='sidebar']").first(),
    ).toBeVisible()
    await expect(authenticatedPage).toHaveScreenshot("settings.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    })
  })

  test("Tenant settings page", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/settings/tenant", {
      waitUntil: "domcontentloaded",
    })
    await expect(
      authenticatedPage.locator("[data-sidebar='sidebar']").first(),
    ).toBeVisible()
    await expect(authenticatedPage).toHaveScreenshot("settings-tenant.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    })
  })
})
