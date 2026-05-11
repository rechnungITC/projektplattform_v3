import { expect, test } from "@playwright/test"

/** PROJ-57 — participant-links public-surface smoke. */

const PROJECT_UUID = "00000000-0000-0000-0000-000000000000"

test.describe("PROJ-57 / participant-links public surface", () => {
  test("API: GET /api/projects/[id]/participant-links is auth-gated", async ({
    request,
  }) => {
    const res = await request.get(
      `/api/projects/${PROJECT_UUID}/participant-links`,
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect([307, 401]).toContain(res.status())
  })
})
