import { expect, test } from "@playwright/test"

/**
 * PROJ-56 — Project Readiness public-surface smoke.
 *
 * Authenticated UI rendering requires the PROJ-29 auth-fixture and
 * is out of scope for this smoke. We pin that the new readiness
 * route is gated behind auth and not exposed by accident.
 */

const PROJECT_UUID = "00000000-0000-0000-0000-000000000000"

test.describe("PROJ-56 / readiness public surface", () => {
  test("API: GET /api/projects/[id]/readiness is auth-gated", async ({
    request,
  }) => {
    const res = await request.get(
      `/api/projects/${PROJECT_UUID}/readiness`,
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect([307, 401], `readiness route → ${res.status()}`).toContain(
      res.status(),
    )
  })
})
