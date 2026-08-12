/**
 * PROJ-51-ε — Visual Regression baseline tests.
 *
 * Per the locked Tech Design (Fork 5b: Playwright-Snapshots):
 *   `toHaveScreenshot({ maxDiffPixels: 20 })` — a measured bound, not a
 *   ratio. PROJ-Y-143m: the inherited `maxDiffPixelRatio` (0.01 here, 0.02
 *   for the theme flip) allowed 9,216 px on a 1280x720 frame, and it hid a
 *   real drift — after PROJ-Y-143m translated these forms the login baseline
 *   differed by 5,213 px and the dark one by 4,527 px, yet both stayed
 *   **green while showing English text the page no longer renders**. Same
 *   blind spot PROJ-Y-143g measured away on the authenticated suite, which
 *   deliberately left this file alone. Noise here is 0 px across three runs
 *   at zero tolerance, so 20 px covers antialiasing and nothing else.
 *   8 key pages targeted; this commit lands 2 baseline tests (Login +
 *   marketing-public root) to validate the setup before extending the
 *   matrix to authenticated pages (which need test-tenant seeding).
 *
 * Snapshots land under `tests/PROJ-51-visual-regression.spec.ts-
 * snapshots/` automatically on the first run. CI must be triggered with
 * `npx playwright test --update-snapshots` once to seed the baselines,
 * after which any pixel-diff > 1% causes a failure.
 *
 * Authenticated pages (Dashboard, Stammdaten, Settings) live in
 * `PROJ-51-visual-regression-authenticated.spec.ts` (ε.3) and use the
 * PROJ-29 auth-fixture. Project-Room snapshots are still deferred —
 * they need a fixed-UUID seed project to avoid Date.now() / dynamic-
 * UUID diffs.
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
      maxDiffPixels: 20,
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
      maxDiffPixels: 20,
      fullPage: true,
    })
  })

  test("Signup page matches baseline", async ({ page }) => {
    await page.goto("/signup")
    await expect(
      page.getByRole("textbox", { name: /e-?mail/i }),
    ).toBeVisible()
    await expect(page).toHaveScreenshot("signup.png", {
      maxDiffPixels: 20,
      fullPage: true,
    })
  })

  test("Login (Dark mode) matches baseline", async ({ page }) => {
    // Force dark mode by setting the next-themes class via emulation.
    // This catches Dark-mode-specific token regressions (β-Revision Risk).
    await page.emulateMedia({ colorScheme: "dark" })
    await page.goto("/login")
    await expect(
      page.getByRole("textbox", { name: /e-?mail/i }),
    ).toBeVisible()
    // Wait for theme application — `next-themes` runs a small inline
    // script before paint, but emulation may take a tick.
    await page.waitForFunction(
      () => document.documentElement.classList.contains("dark"),
      { timeout: 2000 },
    ).catch(() => {
      // Theme class may not flip if next-themes uses storage strategy;
      // accept and snapshot anyway. The browser-level emulation still
      // affects `prefers-color-scheme` media queries.
    })
    await expect(page).toHaveScreenshot("login-dark.png", {
      maxDiffPixels: 20,
      fullPage: true,
    })
  })
})
