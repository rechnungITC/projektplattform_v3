/**
 * PROJ-132 — operative reporting auth-gates.
 *
 * Unauthenticated probes on the new operative-report API + CSV export + the
 * in-app tab + the chrome-less print page. Authorization DEPTH (need-to-know
 * filtering across all five sections, no aggregate/pre_read leak across
 * confidentiality levels, anon execute revoked, cross-tenant isolation) is
 * proven by the live pentest tests/sql/PROJ-132-operative-report-pentest.sql
 * (A–G 7/7) on the SECURITY-INVOKER RPC. This spec guards the HTTP surface so
 * nothing is reachable without a session.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-132 / operative-report auth-gates", () => {
  test("GET .../operative-report is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/operative-report`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  // Unauthenticated, even a malformed project id is stopped by the middleware
  // auth-gate (redirect) before the route's Zod uuid check runs. The 400
  // validation path is covered by the route unit test.
  test("GET .../operative-report with a malformed id is still auth-gated", async ({
    request,
  }) => {
    const res = await request.get(`/api/projects/not-a-uuid/operative-report`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET .../operative-report/export is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${DUMMY}/operative-report/export?section=tasks`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("the operative-reporting tab page is auth-gated", async ({ request }) => {
    const res = await request.get(`/projects/${DUMMY}/operatives-reporting`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("the chrome-less print page is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/projects/${DUMMY}/operative-report/print`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })
})
