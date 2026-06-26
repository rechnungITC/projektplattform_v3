/**
 * PROJ-114 — DD-Findings auth-gates.
 *
 * Unauthenticated probes on the findings / summary / escalation API routes.
 * Authorization DEPTH (manager-gating, need-to-know, deal-breaker escalation,
 * SoD, aggregate-leak, immutability, finding≥stream level) is proven by the
 * live pentest tests/sql/PROJ-114-dd-findings-pentest.sql (A–J 10/10) + the
 * PROJ-100b regression. This spec guards the HTTP surface so nothing is
 * reachable without a session.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-114 / DD-Findings auth-gates", () => {
  test("GET .../dd-findings is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/dd-findings`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../dd-findings is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${DUMMY}/dd-findings`, {
      data: { dd_stream_id: DUMMY, title: "X" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PATCH .../dd-findings/[findingId] is auth-gated", async ({ request }) => {
    const res = await request.patch(
      `/api/projects/${DUMMY}/dd-findings/${DUMMY}`,
      {
        data: { status: "in_review" },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect(GATE).toContain(res.status())
  })

  test("GET .../dd-findings/summary is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/dd-findings/summary`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET .../dd-finding-escalations is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${DUMMY}/dd-finding-escalations`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST .../dd-finding-escalations/[escId]/acknowledge is auth-gated", async ({
    request,
  }) => {
    const res = await request.post(
      `/api/projects/${DUMMY}/dd-finding-escalations/${DUMMY}/acknowledge`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("invalid project UUID on dd-findings returns 400 or auth-gate", async ({
    request,
  }) => {
    const res = await request.get(`/api/projects/not-a-uuid/dd-findings`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 400, 401, 403]).toContain(res.status())
  })
})
