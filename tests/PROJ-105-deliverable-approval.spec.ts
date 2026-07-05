/**
 * PROJ-105 α — Deliverable Freigabe-Workflow auth-gates.
 *
 * Guards the HTTP surface: the 4 new API routes (approval GET/POST, respond,
 * withdraw, My-Work dashboard) + the deliverables page with the ?freigabe=
 * deep-link. Behaviour DEPTH (sequential multi-stage → approved, SoD, need-to-
 * know, pending-freeze, anon-revoke, event-immutability, cross-tenant, and the
 * reserved-status/direct-write bypass probes J–M) is proven by the live SQL
 * pentest tests/sql/PROJ-105-deliverable-approvals-pentest.sql (11/11 + J–M, 0
 * residue).
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-105 / Deliverable approval auth-gates", () => {
  test("GET .../deliverables/[did]/approval is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${DUMMY}/deliverables/${DUMMY}/approval`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST .../deliverables/[did]/approval (submit) is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY}/deliverables/${DUMMY}/approval`,
      { data: { approver_stakeholder_ids: [DUMMY] }, failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST .../deliverables/[did]/approval/respond is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY}/deliverables/${DUMMY}/approval/respond`,
      { data: { stage_id: DUMMY, response: "approve" }, failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST .../deliverables/[did]/approval/withdraw is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY}/deliverables/${DUMMY}/approval/withdraw`,
      { data: { approval_id: DUMMY }, failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("GET /api/dashboard/deliverable-approvals is auth-gated", async ({ request }) => {
    const res = await request.get("/api/dashboard/deliverable-approvals", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("the deliverables page with ?freigabe= deep-link is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/projects/${DUMMY}/deliverables?freigabe=${DUMMY}`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })
})
