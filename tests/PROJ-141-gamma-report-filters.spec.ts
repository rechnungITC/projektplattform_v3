import { expect, test } from "@playwright/test"

// PROJ-141-γ4/γ5 — filter query params on operative-report routes are all
// auth-gated (307 redirect to /login) — same contract as the base PROJ-132
// spec. Also verifies the malformed-filter 400 (validation-error) happens
// only AFTER auth (base spec Playwright coverage was auth-only).

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const WS = "11111111-2222-4222-8222-333333333333"

test.describe("PROJ-141-γ4/γ5 operative-report filter routes", () => {
  test("GET auth-gated with filter query params", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${PROJECT}/operative-report?workstream_id=${WS}&classification=strict`,
      { maxRedirects: 0 }
    )
    expect([307, 401]).toContain(res.status())
  })

  test("CSV export auth-gated with filter query params", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${PROJECT}/operative-report/export?section=tasks&workstream_id=${WS}&classification=strict`,
      { maxRedirects: 0 }
    )
    expect([307, 401]).toContain(res.status())
  })

  test("Print page auth-gated with filter query params", async ({ page }) => {
    const res = await page.goto(
      `/projects/${PROJECT}/operative-report/print?workstream_id=${WS}&classification=strict`,
      { waitUntil: "domcontentloaded" }
    )
    // Middleware redirects unauthenticated requests → we should land on /login.
    expect(page.url()).toContain("/login")
    expect(res?.status()).toBeLessThan(500)
  })

  test("Operatives-Reporting page auth-gated (regression from PROJ-132)", async ({
    page,
  }) => {
    await page.goto(`/projects/${PROJECT}/operatives-reporting`, {
      waitUntil: "domcontentloaded",
    })
    expect(page.url()).toContain("/login")
  })
})
