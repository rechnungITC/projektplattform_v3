/**
 * PROJ-51-ε.5 — Mobile-Layout visual regression.
 *
 * Mobile Safari (iPhone 13 viewport) renders the AppShell with a
 * collapsed sidebar behind a hamburger menu, plus the Project-Room's
 * mobile tab strip (`<ProjectRoomShell>` `md:hidden` nav). These layouts
 * are different enough from the desktop snapshots to justify their own
 * baselines. Skipped on chromium — desktop snapshots live in their
 * own specs.
 *
 * Authenticated mobile snapshots use the PROJ-29 fixture, so this
 * file self-skips when `globalSetup` couldn't provision auth (no
 * `SUPABASE_SERVICE_ROLE_KEY` etc.).
 */

import { expect, test as anonTest } from "@playwright/test"

import { test, expect as authExpect } from "./fixtures/auth-fixture"

// ---------------------------------------------------------------------
// Unauth mobile baselines (Login + Signup) — covered by Mobile Safari
// project automatically. These use the plain Playwright test runner
// since they don't need the auth fixture.
// ---------------------------------------------------------------------

anonTest.describe("PROJ-51-ε.5 — Mobile (unauth)", () => {
  anonTest.skip(
    ({ browserName }) => browserName === "chromium",
    "Mobile snapshots run only on Mobile Safari.",
  )

  anonTest("Login on mobile", async ({ page }) => {
    await page.goto("/login")
    await expect(
      page.getByRole("textbox", { name: /e-?mail/i }),
    ).toBeVisible()
    await expect(page).toHaveScreenshot("mobile-login.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: true,
    })
  })

  anonTest("Signup on mobile", async ({ page }) => {
    await page.goto("/signup")
    await expect(
      page.getByRole("textbox", { name: /e-?mail/i }),
    ).toBeVisible()
    await expect(page).toHaveScreenshot("mobile-signup.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: true,
    })
  })
})

// ---------------------------------------------------------------------
// Authenticated mobile baselines (Dashboard + Projects + Settings).
// ---------------------------------------------------------------------

test.describe("PROJ-51-ε.5 — Mobile (authenticated)", () => {
  test.skip(
    ({ browserName }) => browserName === "chromium",
    "Mobile snapshots run only on Mobile Safari.",
  )

  test("Dashboard on mobile", async ({ authenticatedPage }) => {
    const response = await authenticatedPage.goto("/", {
      waitUntil: "domcontentloaded",
    })
    authExpect(response?.status()).toBeLessThan(400)
    // On mobile the sidebar is collapsed behind a sheet — wait for any
    // body content to be visible instead of the desktop sidebar marker.
    await authenticatedPage.waitForLoadState("networkidle")
    await authExpect(authenticatedPage).toHaveScreenshot(
      "mobile-dashboard.png",
      {
        maxDiffPixelRatio: 0.03,
        fullPage: true,
      },
    )
  })

  test("Projects list on mobile", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/projects", {
      waitUntil: "domcontentloaded",
    })
    await authenticatedPage.waitForLoadState("networkidle")
    await authExpect(authenticatedPage).toHaveScreenshot(
      "mobile-projects.png",
      {
        maxDiffPixelRatio: 0.03,
        fullPage: true,
      },
    )
  })

  test("Settings on mobile", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/settings", {
      waitUntil: "domcontentloaded",
    })
    await authenticatedPage.waitForLoadState("networkidle")
    await authExpect(authenticatedPage).toHaveScreenshot(
      "mobile-settings.png",
      {
        maxDiffPixelRatio: 0.03,
        fullPage: true,
      },
    )
  })
})
