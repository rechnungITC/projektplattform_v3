import { expect, test } from "@playwright/test"

/**
 * PROJ-34 ε — Coaching Recommendations surface smoke.
 *
 * Auth-gate confirmation for the three ε API routes. Full happy-path /
 * accept-reject-modify behavior is covered by the vitest suites.
 */

const PROJECT_ID = "00000000-0000-0000-0000-000000000000"
const STAKEHOLDER_ID = "00000000-0000-0000-0000-000000000001"

test.describe("PROJ-34 ε / coaching recommendations surface", () => {
  test("API: GET coaching-recommendations is auth-gated", async ({
    request,
  }) => {
    const res = await request.get(
      `/api/projects/${PROJECT_ID}/stakeholders/${STAKEHOLDER_ID}/coaching-recommendations`,
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect([307, 401]).toContain(res.status())
  })

  test("API: POST coaching-trigger is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${PROJECT_ID}/stakeholders/${STAKEHOLDER_ID}/coaching-trigger`,
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect([307, 401]).toContain(res.status())
  })

  test("API: PATCH review-batch is auth-gated", async ({ request }) => {
    const res = await request.patch(
      `/api/projects/${PROJECT_ID}/stakeholders/${STAKEHOLDER_ID}/coaching-recommendations/review`,
      {
        data: {
          decisions: [
            {
              recommendation_id: STAKEHOLDER_ID,
              decision: "accept",
            },
          ],
        },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect([307, 401]).toContain(res.status())
  })
})
