/**
 * PROJ-99 / 128 / 129 — confidentiality bundle frontend auth-gates.
 *
 * Unauthenticated probes on the advisor-profile, NDA-register, NDA-assignment
 * and access-explain API routes + the Governance & Zugriff project-room page
 * (reuses the /vertraulichkeit route).
 *
 * Authorization DEPTH (manager-gating, the additive advisor gate
 * mandate+NDA+clearance, tenant isolation, the access-explain reason enum) is
 * proven at the backend: the bundle /backend live-smoke (10/10) + the
 * PROJ-100a need-to-know pentest (gate byte-identical for non-advisors) +
 * the ma_access_explain definition review (reasons baseline/admin/
 * mandate_inactive/nda_missing/cleared/no_clearance match the frontend map).
 * This spec guards the HTTP surface so no route/page is reachable without a
 * session.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-99/128/129 / confidentiality bundle auth-gates", () => {
  test("GET .../advisors is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/advisors`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../advisors is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${DUMMY}/advisors`, {
      data: { user_id: DUMMY, organization: "x", advisor_type: "legal" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PATCH .../advisors/[advisorId] is auth-gated", async ({ request }) => {
    const res = await request.patch(
      `/api/projects/${DUMMY}/advisors/${DUMMY}`,
      {
        data: { mandate_status: "blocked" },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect(GATE).toContain(res.status())
  })

  test("DELETE .../advisors/[advisorId] is auth-gated", async ({ request }) => {
    const res = await request.delete(
      `/api/projects/${DUMMY}/advisors/${DUMMY}`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("GET .../ndas is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/ndas`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../ndas is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${DUMMY}/ndas`, {
      data: { counterparty: "x" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PATCH .../ndas/[ndaId] is auth-gated", async ({ request }) => {
    const res = await request.patch(`/api/projects/${DUMMY}/ndas/${DUMMY}`, {
      data: { status: "revoked" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("DELETE .../ndas/[ndaId] is auth-gated", async ({ request }) => {
    const res = await request.delete(`/api/projects/${DUMMY}/ndas/${DUMMY}`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET .../ndas/[ndaId]/assignments is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${DUMMY}/ndas/${DUMMY}/assignments`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST .../ndas/[ndaId]/assignments is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY}/ndas/${DUMMY}/assignments`,
      {
        data: { user_id: DUMMY },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect(GATE).toContain(res.status())
  })

  test("DELETE .../ndas/[ndaId]/assignments/[assignmentId] is auth-gated", async ({
    request,
  }) => {
    const res = await request.delete(
      `/api/projects/${DUMMY}/ndas/${DUMMY}/assignments/${DUMMY}`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("GET .../access-explain (level) is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${DUMMY}/access-explain?level=confidential`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("GET .../access-explain (per-object) is auth-gated", async ({
    request,
  }) => {
    const res = await request.get(
      `/api/projects/${DUMMY}/access-explain?objectType=phase&objectId=${DUMMY}`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("invalid project UUID on access-explain returns 400 or auth-gate", async ({
    request,
  }) => {
    const res = await request.get(
      `/api/projects/not-a-uuid/access-explain?level=confidential`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect([307, 400, 401, 403]).toContain(res.status())
  })

  test("Governance & Zugriff page /vertraulichkeit is auth-gated", async ({
    request,
  }) => {
    const res = await request.get(`/projects/${DUMMY}/vertraulichkeit`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})
