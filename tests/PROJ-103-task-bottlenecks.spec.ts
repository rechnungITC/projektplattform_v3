/**
 * PROJ-103 — Engpass-Übersicht auth-gates.
 *
 * Unauthenticated probes on the new bottleneck API + CSV export + the in-app
 * "Engpässe" tab. Authorization DEPTH (need-to-know filtering, the summary/
 * top-3 aggregate-leak probe across confidentiality levels, anon execute
 * revoked, cross-tenant isolation) is proven by the live pentest
 * tests/sql/PROJ-103-task-bottlenecks-pentest.sql (A–G 7/7) on the
 * SECURITY-INVOKER RPC. This spec guards the HTTP surface so nothing is
 * reachable without a session.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-103 / Engpass-Übersicht auth-gates", () => {
  test("GET .../task-bottlenecks is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/task-bottlenecks`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET .../task-bottlenecks/export (CSV) is auth-gated", async ({
    request,
  }) => {
    const res = await request.get(
      `/api/projects/${DUMMY}/task-bottlenecks/export`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  // Unauthenticated, even a malformed project id is stopped by the middleware
  // auth-gate (redirect) before the route's Zod uuid check runs. The 400
  // validation path is covered by the route unit tests.
  test("GET .../task-bottlenecks with a malformed id is still auth-gated", async ({
    request,
  }) => {
    const res = await request.get(`/api/projects/not-a-uuid/task-bottlenecks`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("the Engpässe tab page is auth-gated", async ({ request }) => {
    const res = await request.get(`/projects/${DUMMY}/engpaesse`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})
