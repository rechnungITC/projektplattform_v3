/**
 * PROJ-100c — 4-eyes clearance approval gate auth-gates.
 *
 * Unauthenticated probes on the new policy/approver/request API routes + the
 * admin config page. Authorization DEPTH (the gate, SoD, M-of-N quorum, approver
 * eligibility, tenant isolation, immutability, default-off byte-identity) is
 * proven by the live pentest tests/sql/PROJ-100c-four-eyes-pentest.sql (A–K
 * 10/10) + the PROJ-100b regression that must stay green. This spec guards the
 * HTTP surface so nothing is reachable without a session.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-100c / 4-eyes approval auth-gates", () => {
  test("GET /api/clearance-approval-policies is auth-gated", async ({ request }) => {
    const res = await request.get("/api/clearance-approval-policies", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PUT /api/clearance-approval-policies is auth-gated", async ({ request }) => {
    const res = await request.put("/api/clearance-approval-policies", {
      data: { level: "strict", enabled: true, persons_required: 1 },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET /api/clearance-approvers is auth-gated", async ({ request }) => {
    const res = await request.get("/api/clearance-approvers", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST /api/clearance-approvers is auth-gated", async ({ request }) => {
    const res = await request.post("/api/clearance-approvers", {
      data: { approver_user_id: DUMMY },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("DELETE /api/clearance-approvers/[id] is auth-gated", async ({ request }) => {
    const res = await request.delete(`/api/clearance-approvers/${DUMMY}`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET .../clearance-requests is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/clearance-requests`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../clearance-requests/[reqId]/respond is auth-gated", async ({
    request,
  }) => {
    const res = await request.post(
      `/api/projects/${DUMMY}/clearance-requests/${DUMMY}/respond`,
      {
        data: { action: "approve" },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST .../clearance-requests/[reqId]/cancel is auth-gated", async ({
    request,
  }) => {
    const res = await request.post(
      `/api/projects/${DUMMY}/clearance-requests/${DUMMY}/cancel`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("invalid project UUID on clearance-requests returns 400 or auth-gate", async ({
    request,
  }) => {
    const res = await request.get(`/api/projects/not-a-uuid/clearance-requests`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 400, 401, 403]).toContain(res.status())
  })

  test("admin config page /stammdaten/vier-augen-genehmigung is auth-gated", async ({
    request,
  }) => {
    const res = await request.get("/stammdaten/vier-augen-genehmigung", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})
