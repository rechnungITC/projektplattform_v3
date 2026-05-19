import { expect, test } from "@playwright/test"

/**
 * PROJ-65 ε.1 — goals + lanes surface smoke (auth-gate).
 *
 * Full happy/edge paths covered in vitest route tests.
 */

const PROJECT_ID = "00000000-0000-0000-0000-000000000000"
const WORK_ITEM_ID = "00000000-0000-0000-0000-000000000001"
const GOAL_ID = "00000000-0000-0000-0000-000000000002"

test.describe("PROJ-65 ε.1 / goals + lanes surface", () => {
  test("GET /goals is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${PROJECT_ID}/goals`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401]).toContain(res.status())
  })

  test("POST /goals is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${PROJECT_ID}/goals`, {
      data: { title: "X" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401]).toContain(res.status())
  })

  test("PATCH /goals/[gid] is auth-gated", async ({ request }) => {
    const res = await request.patch(
      `/api/projects/${PROJECT_ID}/goals/${GOAL_ID}`,
      {
        data: { title: "Y" },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect([307, 401]).toContain(res.status())
  })

  test("DELETE /goals/[gid] is auth-gated", async ({ request }) => {
    const res = await request.delete(
      `/api/projects/${PROJECT_ID}/goals/${GOAL_ID}`,
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect([307, 401]).toContain(res.status())
  })

  test("GET /work-items/[wid]/lanes is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${PROJECT_ID}/work-items/${WORK_ITEM_ID}/lanes`,
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect([307, 401]).toContain(res.status())
  })
})
