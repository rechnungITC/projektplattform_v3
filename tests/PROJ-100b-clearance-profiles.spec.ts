/**
 * PROJ-100b — clearance-profile catalog + confidentiality surface auth-gates.
 *
 * Unauthenticated probes on the four new API routes + the two new pages.
 * Authorization depth (admin/manager gates, tenant isolation, downgrade guard,
 * who-can-see == gate) is proven by the live pentest
 * tests/sql/PROJ-100b-clearance-profiles-pentest.sql; this spec guards the HTTP
 * surface so no route is reachable without a session.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-100b / clearance-profile + confidentiality auth-gates", () => {
  test("GET /api/clearance-profiles is auth-gated", async ({ request }) => {
    const res = await request.get("/api/clearance-profiles", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST /api/clearance-profiles is auth-gated", async ({ request }) => {
    const res = await request.post("/api/clearance-profiles", {
      data: { name: "x", granted_level: "confidential" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PATCH /api/clearance-profiles/[id] is auth-gated", async ({ request }) => {
    const res = await request.patch(`/api/clearance-profiles/${DUMMY}`, {
      data: { is_active: false },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("DELETE /api/clearance-profiles/[id] is auth-gated", async ({ request }) => {
    const res = await request.delete(`/api/clearance-profiles/${DUMMY}`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../clearances/apply-profile is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY}/clearances/apply-profile`,
      {
        data: { user_id: DUMMY, profile_id: DUMMY },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect(GATE).toContain(res.status())
  })

  test("GET .../access-overview is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${DUMMY}/access-overview`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("invalid project UUID on apply-profile returns 400 or auth-gate", async ({
    request,
  }) => {
    const res = await request.post(
      `/api/projects/not-a-uuid/clearances/apply-profile`,
      {
        data: { user_id: DUMMY, profile_id: DUMMY },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect([307, 400, 401, 403]).toContain(res.status())
  })

  test("catalog page /stammdaten/berechtigungsprofile is auth-gated", async ({
    request,
  }) => {
    const res = await request.get("/stammdaten/berechtigungsprofile", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("project-room page /vertraulichkeit is auth-gated", async ({ request }) => {
    const res = await request.get(`/projects/${DUMMY}/vertraulichkeit`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})
