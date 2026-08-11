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

import type { Page } from "@playwright/test"

import { expect, test } from "./fixtures/auth-fixture"
import { E2E_PROJECT_ID } from "./fixtures/constants"

/**
 * PROJ-Y-143b AC-5 — wait until the page is genuinely ready to be photographed.
 *
 * The previous anchor was the sidebar alone. That is the *shell*, not the data:
 * measured on the dashboard, the sidebar is visible at ~1.06s while the panels
 * only finish at ~2.08s. Everything in between photographs skeletons, which are
 * shorter than real content — the observed failure was "expected 1714px,
 * received 1430px", not a pixel diff.
 *
 * Worse than a red test: taking a *baseline* in that window would freeze a
 * loading animation as the expected UI, and the test would stay green while
 * asserting nothing.
 *
 * `[data-slot="skeleton"]` is the shadcn primitive every loading placeholder
 * renders through. Deliberately not `.animate-pulse`: permanent pulsing
 * elements exist (sprint-card live dot, trajectory badges), so that selector
 * would never reach zero on some pages.
 *
 * The 30s budget absorbs a cold dev server — Turbopack compiles each `/api/**`
 * route on first request, which alone can exceed Playwright's 5s default. The
 * warm-compile from PROJ-138 / PROJ-67 AC-9 covers page routes only.
 */
async function waitForDataReady(page: Page) {
  await expect(page.locator("[data-sidebar='sidebar']").first()).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0, {
    timeout: 30_000,
  })
}

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
    await waitForDataReady(authenticatedPage)
    await expect(authenticatedPage).toHaveScreenshot("dashboard.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    })
  })

  // PROJ-Y-143d — the baseline is a 720px empty viewport: it was captured
  // before the list had rendered, so this test was green while asserting
  // nothing. With the data anchor the page is 1200px of real content, which
  // exposes a second problem: the page is not deterministic. It shows relative
  // timestamps ("just now", "5h ago") and the row count grows with every E2E
  // run (six leftover "[E2E 135] Finalize Project" rows and counting).
  // Re-baselining now would just move the red to the next run, so this stays
  // visibly broken until PROJ-Y-143d makes the page reproducible.
  test.fixme("Projects list page", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/projects", {
      waitUntil: "domcontentloaded",
    })
    await waitForDataReady(authenticatedPage)
    await expect(authenticatedPage).toHaveScreenshot("projects-list.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    })
  })

  test("Master Data root", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/stammdaten", {
      waitUntil: "domcontentloaded",
    })
    await waitForDataReady(authenticatedPage)
    await expect(authenticatedPage).toHaveScreenshot("stammdaten.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    })
  })

  test("Resources page", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/stammdaten/resources", {
      waitUntil: "domcontentloaded",
    })
    await waitForDataReady(authenticatedPage)
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
    await waitForDataReady(authenticatedPage)
    await expect(authenticatedPage).toHaveScreenshot("settings.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    })
  })

  // PROJ-Y-143d — unlike the two empty-viewport baselines this one has real
  // content, but it drifted: 4465px baseline vs 4505px actual, 3% of pixels
  // (tolerance is 2%). The 40px delta needs to be classified as expected UI
  // change or genuine defect before a new baseline is frozen — exactly the
  // judgement AC-Y143b.2/.3 reserve for a human.
  test.fixme("Tenant settings page", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/settings/tenant", {
      waitUntil: "domcontentloaded",
    })
    await waitForDataReady(authenticatedPage)
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

  // PROJ-Y-143d — same empty-viewport baseline as the projects list, and the
  // starkest case: 720px frozen against 2423px of actual content. The header
  // comment above already predicted this ("computed paths, work-item counts,
  // last-edit-times"); pinning the seed UUID fixed the URL but not the
  // rendered content. Stays visibly broken until the page is reproducible.
  test.fixme("Project-Room overview", async ({ authenticatedPage }) => {
    const response = await authenticatedPage.goto(`/projects/${E2E_PROJECT_ID}`, {
      waitUntil: "domcontentloaded",
    })
    // Skip cleanly if the seed project upsert failed (warning logged in
    // globalSetup) or the project_type "general" doesn't yet route to
    // /projects/[id] in this codebase.
    if ((response?.status() ?? 0) >= 400) {
      test.skip(true, `Seed project not reachable (${response?.status()}).`)
    }
    await waitForDataReady(authenticatedPage)
    await expect(authenticatedPage).toHaveScreenshot("project-room.png", {
      maxDiffPixelRatio: 0.03,
      fullPage: true,
    })
  })
})
