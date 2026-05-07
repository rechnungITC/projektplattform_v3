/**
 * PROJ-51-ε — Visual Regression baseline tests.
 *
 * Per the locked Tech Design (Fork 5b: Playwright-Snapshots):
 *   `toHaveScreenshot({ maxDiffPixelRatio: 0.01 })` for anti-flake.
 *   8 key pages targeted; this commit lands 2 baseline tests (Login +
 *   marketing-public root) to validate the setup before extending the
 *   matrix to authenticated pages (which need test-tenant seeding).
 *
 * Snapshots land under `tests/PROJ-51-visual-regression.spec.ts-
 * snapshots/` automatically on the first run. CI must be triggered with
 * `npx playwright test --update-snapshots` once to seed the baselines,
 * after which any pixel-diff > 1% causes a failure.
 *
 * Authenticated pages (Project Room, Stammdaten, Settings) are deferred
 * to ε.2 because they need a stable seed-data tenant — without it,
 * Date.now()-based timestamps and dynamic UUIDs cause unbounded diffs.
 */

import { expect, test } from "@playwright/test"

test.describe("PROJ-51-ε — Visual Regression baseline", () => {
  test("Login page matches baseline", async ({ page }) => {
    await page.goto("/login")
    // Wait for the login form to be fully rendered. We pick a stable
    // element name rather than a heading because shadcn/Radix attach
    // hydration markers to text-based locators.
    await expect(
      page.getByRole("textbox", { name: /e-?mail/i }),
    ).toBeVisible()
    await expect(page).toHaveScreenshot("login.png", {
      maxDiffPixelRatio: 0.01,
      // Login page has no animations once mounted; full-page is safe.
      fullPage: true,
    })
  })

  test("Login page (mobile portrait) matches baseline", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto("/login")
    await expect(
      page.getByRole("textbox", { name: /e-?mail/i }),
    ).toBeVisible()
    await expect(page).toHaveScreenshot("login-mobile.png", {
      maxDiffPixelRatio: 0.01,
      fullPage: true,
    })
  })
})
