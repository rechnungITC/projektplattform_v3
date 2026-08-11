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
 * Waits until the page has actually rendered its data — not just its shell.
 *
 * PROJ-Y-143b: the previous anchor was `[data-sidebar='sidebar']`, described
 * as "the most stable indicator of fully loaded". It is not: that element
 * appears at shell hydration (measured at 1061 ms), while the panels fetch
 * afterwards and the final layout only settles at ~2084 ms. With cold
 * `/api/dashboard/*` routes their first Turbopack compile outlived the 5 s
 * `toHaveScreenshot` budget, so the comparison ran against skeletons —
 * 1430 px instead of the 1714 px baseline.
 *
 * The dangerous direction is not the failing comparison but a *re-baseline*
 * taken in that state: it would have frozen a loading animation as the
 * truth, and the test would then have been permanently green while
 * guarding nothing. See AC-Y143b.5–7.
 *
 * The anchor is deliberately two-sided, because either half alone is unsound:
 *
 *  - **positive** — `networkidle` means the panel fetches have come back.
 *    Waiting only for skeletons to be absent would pass *instantly* on a
 *    DOM that has not started rendering them yet.
 *  - **negative** — no skeleton left in the DOM, so React has flushed the
 *    data. Waiting only for the network would still race the paint.
 *
 * `.animate-pulse` is the shadcn `Skeleton` primitive (`ui/skeleton.tsx`).
 * The only other users in `src/` are the Gantt submit state, `sprint-card`
 * and `trajectory-badges` — none of which render on the pages snapshotted
 * here, so on these routes the class means "skeleton" and nothing else.
 * A page with a *persistent* pulse would hang this helper; check that
 * before adding new routes to this spec.
 */
async function waitForRenderedData(page: Page): Promise<void> {
  await expect(page.locator("[data-sidebar='sidebar']").first()).toBeVisible()
  await page.waitForLoadState("networkidle")
  await expect(page.locator(".animate-pulse")).toHaveCount(0, {
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
    await waitForRenderedData(authenticatedPage)
    await expect(authenticatedPage).toHaveScreenshot("dashboard.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    })
  })

  // PROJ-Y-143b: disabled on purpose, and this is an *increase* in honesty.
  // The committed baseline was 1280x720 — exactly the viewport — i.e. a
  // `fullPage` shot of a page that had not grown yet. It shows five grey
  // skeleton rows where the project table belongs, so the test was green
  // while comparing a loading animation.
  //
  // It cannot simply be re-taken in the loaded state either: the table
  // renders `formatRelative(project.updated_at)` (`projects-table.tsx:129`),
  // so cells read "just now" / "10m ago" / "5h ago" and change every run,
  // and the row count grows as other E2E specs create projects (12 rows
  // observed, 11 of them accumulated `[E2E …]` fixtures — see PROJ-Y-143c).
  // Height therefore varies, which rules out a `fullPage` baseline.
  //
  // Re-enabling needs a deliberate coverage decision — clip to the
  // deterministic header/filter region, or pin seed data — tracked as
  // PROJ-Y-143d. Freezing the skeleton again is forbidden by AC-Y143b.7.
  test.fixme("Projects list page", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/projects", {
      waitUntil: "domcontentloaded",
    })
    await waitForRenderedData(authenticatedPage)
    await expect(authenticatedPage).toHaveScreenshot("projects-list.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    })
  })

  test("Master Data root", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/stammdaten", {
      waitUntil: "domcontentloaded",
    })
    await waitForRenderedData(authenticatedPage)
    await expect(authenticatedPage).toHaveScreenshot("stammdaten.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    })
  })

  test("Resources page", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/stammdaten/resources", {
      waitUntil: "domcontentloaded",
    })
    await waitForRenderedData(authenticatedPage)
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
    await waitForRenderedData(authenticatedPage)
    await expect(authenticatedPage).toHaveScreenshot("settings.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    })
  })

  test("Tenant settings page", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/settings/tenant", {
      waitUntil: "domcontentloaded",
    })
    await waitForRenderedData(authenticatedPage)
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

  // PROJ-Y-143b: same defect as the projects list, and the header comment
  // above already predicted the cause — "Project-Room renders more dynamic
  // content (computed paths, work-item counts, last-edit-times)". The
  // committed baseline is 1280x720, the viewport height, so none of that
  // content was captured; under a data anchor the page is 2423px. The old
  // baseline froze the empty shell, which is why nobody noticed.
  // Re-enable via PROJ-Y-143d together with the projects list.
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
    await waitForRenderedData(authenticatedPage)
    await expect(authenticatedPage).toHaveScreenshot("project-room.png", {
      maxDiffPixelRatio: 0.03,
      fullPage: true,
    })
  })
})
