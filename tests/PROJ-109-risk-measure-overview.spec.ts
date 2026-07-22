/**
 * PROJ-109 — Maßnahmen-Übersicht auth-gates.
 *
 * Unauthenticated probes on the new overview API + the in-app "Maßnahmen" tab.
 * Authorization DEPTH (need-to-know filtering, per-measure aggregate-leak
 * probe across confidentiality levels, anon execute revoked, cross-tenant
 * isolation) is proven by the live pentest
 * tests/sql/PROJ-109-risk-measure-overview-pentest.sql (A–H 8/8) on the
 * SECURITY-INVOKER RPC. This spec guards the HTTP surface so nothing is
 * reachable without a session.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-109 / Maßnahmen-Übersicht auth-gates", () => {
  test("GET .../risk-measure-overview is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${DUMMY}/risk-measure-overview`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  // Unauthenticated, even a malformed project id is stopped by the middleware
  // auth-gate (redirect) before the route's Zod uuid check runs. The 400
  // validation path is covered by the route unit test
  // (src/app/api/projects/[id]/risk-measure-overview/route.test.ts).
  test("GET .../risk-measure-overview with a malformed id is still auth-gated", async ({
    request,
  }) => {
    const res = await request.get(
      `/api/projects/not-a-uuid/risk-measure-overview`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("the Maßnahmen tab page is auth-gated", async ({ request }) => {
    const res = await request.get(`/projects/${DUMMY}/massnahmen`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})
