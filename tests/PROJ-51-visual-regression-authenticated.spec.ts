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
import { E2E_PROJECT_ID } from "./fixtures/constants"

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

/**
 * PROJ-51-ε.4 — Project-Room baselines. Uses the fixed-UUID seed
 * project provisioned by `globalSetup` so the URL is stable across
 * runs. Tolerance bumped to 0.03 because Project-Room renders more
 * dynamic content (computed paths, work-item counts, last-edit-times)
 * even with an empty seed. If a sub-route's snapshot proves too jittery
 * after the first baseline run, narrow the snapshot to a clip rather
 * than relax the threshold further.
 */
test.describe("PROJ-51-ε.4 — Visual Regression (Project-Room)", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Project-Room snapshots are pinned to desktop chromium for now.",
  )

  test("Project-Room overview", async ({ authenticatedPage }) => {
    const response = await authenticatedPage.goto(`/projects/${E2E_PROJECT_ID}`, {
      waitUntil: "domcontentloaded",
    })
    // Skip cleanly if the seed project upsert failed (warning logged in
    // globalSetup) or the project_type "general" doesn't yet route to
    // /projects/[id] in this codebase.
    if ((response?.status() ?? 0) >= 400) {
      test.skip(true, `Seed project not reachable (${response?.status()}).`)
    }
    await expect(
      authenticatedPage.locator("[data-sidebar='sidebar']").first(),
    ).toBeVisible()
    await expect(authenticatedPage).toHaveScreenshot("project-room.png", {
      maxDiffPixelRatio: 0.03,
      fullPage: true,
    })
  })
})
