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
import {
  dashboardApprovalsFixture,
  dashboardDeliverableApprovalsFixture,
  dashboardSummaryFixture,
  FIXED_NOW,
} from "./fixtures/dashboard-payload"

/**
 * PROJ-Y-143f — the tenant control in the sidebar footer is shared-account
 * state, so it cannot be part of a stable baseline.
 *
 * `tenant-switcher.tsx` renders a plain label below two memberships and a
 * dropdown *button* (different size, plus a chevron) from two upwards. On
 * 2026-08-12 a parallel slice added this shared E2E user to a second tenant
 * for its own tests, and that single row flipped the control on **every**
 * authenticated page — all seven baselines went red at once, ~1,038 px each,
 * for a reason unrelated to any of them.
 *
 * Freezing the switched state instead would only invert the problem: the
 * baselines would then depend on that foreign tenant continuing to exist.
 * Masking is the structural answer — the region is small, and what it shows
 * is account bookkeeping rather than the page under test. Pinning *which*
 * tenant is active happens separately, in `global-setup`.
 */
function sharedStateMasks(page: Page) {
  return [
    page.locator(
      '[aria-label="Current workspace"], [aria-label="Switch workspace"]',
    ),
  ]
}

/**
 * PROJ-Y-143h — answer the three dashboard endpoints from the pinned
 * fixture. Everything else on the page still hits the real app.
 *
 * The patterns are anchored with `**` on both sides so they match whether
 * the app requests them relative or absolute, and each handler is
 * registered before navigation so no live response can win the race.
 */
async function routeDashboardFixtures(page: Page): Promise<void> {
  const payloads: Record<string, unknown> = {
    "**/api/dashboard/summary**": { summary: dashboardSummaryFixture },
    "**/api/dashboard/approvals**": dashboardApprovalsFixture,
    "**/api/dashboard/deliverable-approvals**":
      dashboardDeliverableApprovalsFixture,
  }
  // No overlap to worry about: glob segments are exact, so
  // "**/api/dashboard/approvals**" does not match the
  // ".../deliverable-approvals" path — the segment differs.
  for (const [pattern, body] of Object.entries(payloads)) {
    await page.route(pattern, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      }),
    )
  }
}

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
  // PROJ-Y-143d: the dev server's "Compiling …" badge must be gone too.
  // It lives in the `<nextjs-portal>` shadow root (Playwright's CSS engine
  // pierces open shadow roots, so this locator reaches it) and only exists
  // while Turbopack is busy. Taking a baseline in that moment bakes a piece
  // of *tooling* state into the image — and at ~0.4% of a 1280x720 frame it
  // sits comfortably under `maxDiffPixels: 0`, so it would neither
  // fail the run nor announce itself. Suppressing the host via the
  // screenshot stylesheet was tried first and did **not** remove it, so we
  // wait it out instead of hiding it.
  await expect(page.locator("nextjs-portal").getByText(/compil/i)).toHaveCount(
    0,
    { timeout: 60_000 },
  )
}

test.describe("PROJ-51-ε.3 — Visual Regression (authenticated)", () => {
  // Desktop-only: on mobile the sidebar collapses behind a hamburger,
  // changing the layout substantially. Mobile snapshots are a separate
  // follow-up that should target the mobile shell explicitly.
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Authenticated visual snapshots are pinned to desktop chromium for now.",
  )


  // PROJ-Y-143h: the dashboard is the one page whose stability came from the
  // *tenant*, not from the page — every KPI read 0 and My Work read
  // "0 Items" only because nothing was assigned to the [E2E] user, while
  // four panels format dates. PROJ-Y-143g measured both failure modes: a
  // counter going 0 -> 3 costs 82 px (so a tight bound goes red as soon as
  // any other spec seeds data) and the 2% ratio allowed ~44,000 px (so My
  // Work could fill with rows unnoticed). No tolerance number fixes that.
  //
  // So the data is pinned at the network boundary instead. The page stays
  // real — real shell, real components, real layout, real navigation; only
  // the three dashboard endpoints answer from a typed fixture. Compared to
  // the two options registered in 143g this needs no `data-testid` in seven
  // production components (masking) and writes nothing into the shared
  // tenant (seeding), and unlike masking it leaves the panels *rendered*,
  // so their content is guarded rather than painted over.
  //
  // Both pins are necessary and neither is sufficient:
  //   - the fixture fixes *what* is rendered;
  //   - `clock.setFixedTime` fixes *when*, because `my-work-panel.tsx`
  //     buckets rows through `Date.now()` for the "Bald fällig" chip count,
  //     so even a fixed due date would drift as real time passes.
  //     `setFixedTime` pins Date/now readings but keeps timers running, so
  //     React and Next behave normally.
  //
  // The live dashboard keeps its own smoke below; this test owns the image.
  test("Dashboard with pinned data", async ({ authenticatedPage }) => {
    await authenticatedPage.clock.setFixedTime(FIXED_NOW)
    await routeDashboardFixtures(authenticatedPage)

    const response = await authenticatedPage.goto("/", {
      waitUntil: "domcontentloaded",
    })
    expect(response?.status()).toBeLessThan(400)
    await waitForRenderedData(authenticatedPage)
    // Guard against the fixture silently not being used: with live data
    // every counter is 0, so a non-zero KPI proves the route interception
    // took effect before the panels rendered.
    await expect(
      authenticatedPage.getByLabel("Offene Aufgaben: 4"),
    ).toBeVisible()

    await expect(authenticatedPage).toHaveScreenshot("dashboard.png", {
      maxDiffPixels: 20,
      fullPage: true,
      mask: sharedStateMasks(authenticatedPage),
    })
  })

  // Live counterpart, deliberately without a screenshot. It keeps the real
  // page in the suite — the aggregation endpoint really answers, the shell
  // really renders — without re-introducing a baseline whose content nobody
  // controls. This is the half that would notice a broken /api/dashboard/*.
  test("Dashboard renders past auth gate (live data)", async ({
    authenticatedPage,
  }) => {
    const response = await authenticatedPage.goto("/", {
      waitUntil: "domcontentloaded",
    })
    expect(response?.status()).toBeLessThan(400)
    await waitForRenderedData(authenticatedPage)
    await expect(
      authenticatedPage.getByRole("heading", { name: /Hallo,/ }),
    ).toBeVisible()
  })

  // Fixture-drift guard. The typed fixture already fails to compile if the
  // `DashboardSummary` contract changes, but that only binds the fixture to
  // the *type* — a route that drifts away from its own type would go
  // unnoticed, and the visual test would then happily guard a shape the
  // server no longer sends. So compare the live payload's keys against the
  // fixture's, top level and per section.
  test("dashboard fixture still matches the live contract", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/", { waitUntil: "domcontentloaded" })
    const live = await authenticatedPage.evaluate(async () => {
      const res = await fetch("/api/dashboard/summary", {
        credentials: "include",
      })
      return (await res.json()) as { summary: Record<string, unknown> }
    })

    expect(Object.keys(live.summary).sort()).toEqual(
      Object.keys(dashboardSummaryFixture).sort(),
    )
    for (const section of [
      "my_work",
      "approvals",
      "project_health",
      "alerts",
      "reports",
    ] as const) {
      const liveSection = live.summary[section] as Record<string, unknown>
      expect(Object.keys(liveSection).sort()).toEqual(
        expect.arrayContaining(["data", "state"]),
      )
      const liveData = liveSection.data as Record<string, unknown> | null
      const fixtureData = dashboardSummaryFixture[section].data as Record<
        string,
        unknown
      > | null
      if (liveData && fixtureData) {
        expect(Object.keys(liveData).sort()).toEqual(
          Object.keys(fixtureData).sort(),
        )
      }
    }
    expect(Object.keys(live.summary.kpis as object).sort()).toEqual(
      Object.keys(dashboardSummaryFixture.kpis).sort(),
    )
  })

  // PROJ-Y-143d: re-enabled with a deterministic capture.
  //
  // History: the old baseline was a `fullPage` shot frozen at 1280x720 —
  // exactly the viewport — showing five skeleton rows instead of the table
  // (PROJ-Y-143b). It was green while comparing a loading animation.
  //
  // A loaded `fullPage` baseline is impossible here, so this is not a
  // re-take but a changed capture strategy. Two independent sources of
  // non-determinism:
  //   1. `projects-table.tsx:129` renders `formatRelative(updated_at)` —
  //      cells read "just now" / "10m ago" and change between runs;
  //   2. the row count grows as other E2E specs create projects, so the
  //      page height grows with the tenant's history (PROJ-Y-143c).
  //
  // Both are handled structurally rather than by tolerance:
  //   - `fullPage: false` pins the capture to the 1280x720 viewport, so
  //     height cannot drift with row count. This is the one case where a
  //     720px-high snapshot is correct by construction rather than the
  //     symptom of a missed load (see the AC-Y143b.7 self-check).
  //   - `mask` paints over the table body, so the volatile cells cannot
  //     produce a diff.
  //
  // What this still guards: shell, sidebar, page header, the Filters card
  // and the table *header* row. What it deliberately does not guard: the
  // row content. That trade is the point — the previous version guarded
  // nothing at all while appearing to pass.
  //
  // Tolerance (PROJ-Y-143d closure): an absolute `maxDiffPixels`, not the
  // inherited `maxDiffPixels: 0`. All three numbers below were
  // measured on this capture, not estimated:
  //
  //   - run-to-run noise .......... 0 px (four consecutive runs identical)
  //   - "Name" -> "NameZZ" in the
  //     table header ............. 42 px  <- smallest change worth catching
  //   - the 0.02 ratio allowed .... ~18,400 px
  //
  // So the inherited ratio was ~440x too coarse to notice a renamed column
  // header, and it stayed green when that rename was injected. That is the
  // same blind spot which let the Next dev-indicator (F-1) ride along at
  // ~0.4% unnoticed. A tight absolute bound is affordable *because* the
  // capture is now deterministic; 20 px sits between the measured noise
  // floor and the smallest real change, so it covers incidental
  // antialiasing without covering content.
  test("Projects list page", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/projects", {
      waitUntil: "domcontentloaded",
    })
    await waitForRenderedData(authenticatedPage)
    await expect(authenticatedPage).toHaveScreenshot("projects-list.png", {
      maxDiffPixels: 20,
      fullPage: false,
      mask: [
        authenticatedPage.locator("table tbody"),
        ...sharedStateMasks(authenticatedPage),
      ],
    })
  })

  // PROJ-Y-143g: absolute bound, same reasoning as the two viewport-pinned
  // captures in PROJ-Y-143d. This page renders a static card grid — labels
  // and descriptions from the nav registry, no counts, no timestamps — so
  // its determinism is structural, not a side effect of an empty tenant.
  // Measured here: noise 0 px over three runs at tolerance 0, and renaming
  // the "Stammdaten" h1 by two characters costs 228 px.
  test("Master Data root", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/stammdaten", {
      waitUntil: "domcontentloaded",
    })
    await waitForRenderedData(authenticatedPage)
    await expect(authenticatedPage).toHaveScreenshot("stammdaten.png", {
      maxDiffPixels: 20,
      fullPage: true,
      mask: sharedStateMasks(authenticatedPage),
    })
  })

  // PROJ-Y-143g: absolute bound. Note what this page currently *is*: the
  // resource list area shows the red "Resource not found." error (F-2 of
  // PROJ-Y-143d, tracked as PROJ-Y-143f), which is why a fullPage shot is
  // only 720px high. That state is static, so the bound is safe — but the
  // tighter bound now also means this test will go red the moment
  // PROJ-Y-143f replaces the error with a real (or empty) list. That is
  // correct behaviour: re-take the baseline as part of that fix.
  // Measured: noise 0 px over three runs, two-character change 44 px.
  test("Resources page", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/stammdaten/resources", {
      waitUntil: "domcontentloaded",
    })
    await waitForRenderedData(authenticatedPage)
    await expect(authenticatedPage).toHaveScreenshot(
      "stammdaten-resources.png",
      {
        maxDiffPixels: 20,
        fullPage: true,
        mask: sharedStateMasks(authenticatedPage),
      },
    )
  })

  // PROJ-Y-143g: absolute bound. Static form chrome; the only tenant-derived
  // values are the workspace name and domain, which no spec edits.
  // Measured: noise 0 px over three runs, two-character change 42 px.
  test("Settings root", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/settings", {
      waitUntil: "domcontentloaded",
    })
    await waitForRenderedData(authenticatedPage)
    await expect(authenticatedPage).toHaveScreenshot("settings.png", {
      maxDiffPixels: 20,
      fullPage: true,
      mask: sharedStateMasks(authenticatedPage),
    })
  })

  // PROJ-Y-143g: absolute bound. This is the page the old ratio treated
  // worst — at 1280x4505 the 2% allowance was over 115,000 pixels, while a
  // two-character change measures 42 px. Same static-form reasoning as
  // /settings; it is also the baseline that caught the PROJ-130-α
  // FormDescription growth in PROJ-Y-143d, which is the kind of change the
  // ratio would have hidden had it been slightly smaller.
  test("Tenant settings page", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/settings/tenant", {
      waitUntil: "domcontentloaded",
    })
    await waitForRenderedData(authenticatedPage)
    await expect(authenticatedPage).toHaveScreenshot("settings-tenant.png", {
      maxDiffPixels: 20,
      fullPage: true,
      mask: sharedStateMasks(authenticatedPage),
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

  // PROJ-Y-143d: re-enabled, same strategy as the projects list.
  //
  // The old baseline was 1280x720 `fullPage` — the empty shell — while the
  // loaded page is 2423px (PROJ-Y-143b). The file header above had already
  // named the risk ("computed paths, work-item counts, last-edit-times");
  // the frozen shell hid it.
  //
  // Pinned to the viewport (`fullPage: false`) rather than masked: the
  // volatile parts of this page — the absolute `CREATED` timestamp and the
  // Master-data block — sit *below* the fold, while everything above it
  // (title, lifecycle badges, Budget/Risiken/Health tiles, the Projekt-Setup
  // counters) is derived from the fixed-UUID seed project and is therefore
  // stable. Verified over three consecutive runs.
  //
  // Tolerance: `maxDiffPixels` for the same reason as the projects list.
  // The inherited 0.03 ratio allowed ~27,600 differing pixels on a
  // 1280x720 frame — more area than the entire Projekt-Setup card — while
  // appending two characters to that card's title measures 97 px. Noise
  // here is likewise 0 across four consecutive runs.
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
    await waitForRenderedData(authenticatedPage)
    await expect(authenticatedPage).toHaveScreenshot("project-room.png", {
      maxDiffPixels: 20,
      fullPage: false,
      mask: sharedStateMasks(authenticatedPage),
    })
  })
})
