/**
 * PROJ-116 — consolidated DD report auth-gates.
 *
 * Unauthenticated probes on the new report API + the in-app view + the
 * chrome-less print page. Authorization DEPTH (need-to-know filtering, no
 * aggregate/red-flag leak across confidentiality levels, anon execute revoked,
 * cross-tenant isolation) is proven by the live pentest
 * tests/sql/PROJ-116-dd-report-pentest.sql (A–H 8/8) on the SECURITY-INVOKER
 * RPC. This spec guards the HTTP surface so nothing is reachable without a
 * session.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-116 / DD-report auth-gates", () => {
  test("GET .../dd-report is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/dd-report`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  // Unauthenticated, even a malformed project id is stopped by the middleware
  // auth-gate (redirect) before the route's Zod uuid check runs. The 400
  // validation path itself is covered by the route unit test
  // (src/app/api/projects/[id]/dd-report/route.test.ts).
  test("GET .../dd-report with a malformed id is still auth-gated", async ({
    request,
  }) => {
    const res = await request.get(`/api/projects/not-a-uuid/dd-report`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("the DD-report view page is auth-gated", async ({ request }) => {
    const res = await request.get(`/projects/${DUMMY}/dd-bericht`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("the chrome-less print page is auth-gated", async ({ request }) => {
    const res = await request.get(`/projects/${DUMMY}/dd-report/print`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})