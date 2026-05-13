import { expect, test } from "@playwright/test"

/**
 * PROJ-34 γ.2 — AI Sentiment Review surface smoke.
 *
 * Both routes are implemented (γ.2 /backend pass). The smoke confirms
 * unauthenticated callers are rejected with 401/307 (proxy auth-gate);
 * full happy/edge paths are covered in the route's vitest suite.
 */

const PROJECT_ID = "00000000-0000-0000-0000-000000000000"
const INTERACTION_ID = "00000000-0000-0000-0000-000000000001"

test.describe("PROJ-34 γ.2 / AI sentiment review surface", () => {
  test("API: POST sentiment-trigger is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${PROJECT_ID}/interactions/${INTERACTION_ID}/sentiment-trigger`,
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect([307, 401]).toContain(res.status())
  })

  test("API: PATCH ai-review batch is auth-gated", async ({ request }) => {
    const res = await request.patch(
      `/api/projects/${PROJECT_ID}/interactions/${INTERACTION_ID}/ai-review`,
      {
        data: { decisions: [{ stakeholder_id: PROJECT_ID, decision: "accept" }] },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect([307, 401]).toContain(res.status())
  })
})
