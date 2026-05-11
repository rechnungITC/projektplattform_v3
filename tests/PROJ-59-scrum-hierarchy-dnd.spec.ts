import { expect, test } from "@playwright/test"

/**
 * PROJ-59 δ — Scrum Hierarchy DnD: public-surface smoke.
 *
 * The α/β/γ slices shipped the Parent-Route, Drop-Intent
 * architecture, and the Scrum-Board Parent-Drop UX. The δ slice
 * closes the spec by pinning the regression surface: every
 * relevant API endpoint stays auth-gated under the current
 * production middleware. Authenticated UX flows still require the
 * PROJ-29 fixture and are covered by the targeted vitest route
 * tests (37 cases green).
 */

const PROJECT_UUID = "00000000-0000-0000-0000-000000000000"
const WORK_ITEM_UUID = "11111111-1111-4111-8111-111111111111"

test.describe("PROJ-59 / scrum hierarchy DnD public surface", () => {
  test("API: PATCH parent route is auth-gated", async ({ request }) => {
    const res = await request.patch(
      `/api/projects/${PROJECT_UUID}/work-items/${WORK_ITEM_UUID}/parent`,
      {
        data: { parent_id: null },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect([307, 401], `PATCH parent → ${res.status()}`).toContain(res.status())
  })

  test("API: PATCH sprint route is auth-gated (no parent fall-through)", async ({
    request,
  }) => {
    const res = await request.patch(
      `/api/projects/${PROJECT_UUID}/work-items/${WORK_ITEM_UUID}/sprint`,
      {
        data: { sprint_id: null },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect([307, 401]).toContain(res.status())
  })

  test("API: PATCH status route is auth-gated", async ({ request }) => {
    const res = await request.patch(
      `/api/projects/${PROJECT_UUID}/work-items/${WORK_ITEM_UUID}/status`,
      {
        data: { status: "in_progress" },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect([307, 401]).toContain(res.status())
  })

  test("API: POST sprint-bulk route is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${PROJECT_UUID}/work-items/sprint-bulk`,
      {
        data: { work_item_ids: [WORK_ITEM_UUID], sprint_id: null },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect([307, 401]).toContain(res.status())
  })
})
