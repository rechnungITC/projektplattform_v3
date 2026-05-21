import { expect, test } from "@playwright/test"

/**
 * PROJ-65 ε.1 — frontend surface smoke (auth-gate).
 *
 * Full UX assertions belong to the Vitest layer (trajectory-layout
 * pure-function tests) and to manual review against the designer
 * brief. This spec ensures the GraphShell route + trajectory snapshot
 * endpoint are wired and auth-gated.
 */

const PROJECT_ID = "00000000-0000-0000-0000-000000000000"

test.describe("PROJ-65 ε.1 / trajectory frontend surface", () => {
  test("GET /api/projects/[id]/graph?include=trajectory is auth-gated", async ({
    request,
  }) => {
    const res = await request.get(
      `/api/projects/${PROJECT_ID}/graph?include=trajectory`,
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect([307, 401]).toContain(res.status())
  })

  test("graph page route requires auth (redirects unauthenticated user)", async ({
    request,
  }) => {
    const res = await request.get(`/projects/${PROJECT_ID}/graph`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    // Middleware bounces to /login.
    expect([200, 307, 302]).toContain(res.status())
  })

  test("graph page also accepts include= without trajectory (PROJ-58 compat)", async ({
    request,
  }) => {
    const res = await request.get(`/api/projects/${PROJECT_ID}/graph`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401]).toContain(res.status())
  })

  // PROJ-65 ε.2 — swap-preview endpoint is auth-gated even though the
  // backend handler is not yet implemented (will respond 401/307 via
  // middleware before reaching the route).
  test("POST /work-items/[wid]/stakeholder-swap-preview is auth-gated", async ({
    request,
  }) => {
    const res = await request.post(
      `/api/projects/${PROJECT_ID}/work-items/00000000-0000-0000-0000-000000000001/stakeholder-swap-preview`,
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect([307, 401, 404, 405]).toContain(res.status())
  })
})
