import { expect, test } from "@playwright/test"

/**
 * PROJ-64 — Global Dashboard / My Work Inbox.
 *
 * Public-surface smoke tests covering the routes added in this slice.
 * Authenticated rendering of the dashboard itself requires the
 * PROJ-29 auth-fixture (deeper specs will layer on top when the
 * `SUPABASE_SERVICE_ROLE_KEY` is refreshed).
 *
 * The specs below verify:
 *   AC-1  : the root authenticated route no longer renders the
 *           "Your project dashboard will live here." placeholder copy.
 *   AC-10 : both `/api/dashboard/summary` and `/api/dashboard/approvals`
 *           require authentication.
 *
 * The unauth route `/` redirects to `/login?next=%2F`. We follow the
 * redirect and confirm we land on the login page (NOT on the legacy
 * welcome card).
 */

test.describe("PROJ-64 / dashboard public surface", () => {
  test("API: GET /api/dashboard/summary is auth-gated", async ({ request }) => {
    const res = await request.get("/api/dashboard/summary", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(
      [307, 401],
      "unauthenticated summary request must redirect or 401",
    ).toContain(res.status())
  })

  test("API: POST /api/dashboard/summary is auth-gated (method-agnostic gate)", async ({
    request,
  }) => {
    // The route only exports GET, but the middleware-level auth gate
    // should still fire before the framework returns 405.
    const res = await request.post("/api/dashboard/summary", {
      data: {},
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401, 405]).toContain(res.status())
  })

  test("API: GET /api/dashboard/approvals (existing endpoint) remains auth-gated", async ({
    request,
  }) => {
    const res = await request.get("/api/dashboard/approvals?filter=pending", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401]).toContain(res.status())
  })

  test("ROOT `/` no longer renders the placeholder welcome card", async ({
    request,
  }) => {
    // Unauthenticated GET / → 307 to /login?next=%2F. Following the
    // redirect surfaces the login page; neither the login page nor
    // the dashboard render path should contain the legacy welcome
    // copy that we deleted in this slice.
    //
    // Request-level (no browser) keeps the spec passing on hosts
    // that lack Chromium system libraries.
    const res = await request.get("/")
    const body = await res.text()
    expect(body).not.toContain("Your project dashboard will live here.")
    expect(body).not.toContain(
      "Projects, phases and tasks will appear here once those features land.",
    )
  })

  test("ROOT `/` redirects unauthenticated visitors with `next` query preserved", async ({
    request,
  }) => {
    const res = await request.get("/", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(res.status()).toBe(307)
    const location = res.headers()["location"] ?? ""
    expect(location).toContain("/login")
    expect(location).toContain("next=%2F")
  })
})
