/**
 * PROJ-93 — Trusted-EU-Processor DPA attest/revoke: auth-gate verification.
 *
 * The DPA attest/revoke surface is a new sub-route
 * `/api/tenants/[id]/ai-providers/[provider]/dpa` (POST attest / DELETE revoke),
 * admin-gated. Without a session every method must be gated (307 redirect to
 * login, or 401/403) — never reachable unauthenticated. The settings page that
 * hosts the attest card must likewise be auth-gated.
 *
 * Mirrors the PROJ-92 / PROJ-89 / PROJ-88 auth-gate pattern. The functional
 * behaviour (DPA-conditional Class-3 gate, floor-CHECK anti-scope, member
 * visibility R-2, revoke effect R-1, anon revoke) is proven by the live prod
 * smoke `tests/sql/PROJ-93-trusted-processor-pentest.sql` (A–J 10/10) + the
 * resolver class-3 regression + DPA route unit suites. This spec pins the
 * route-level + page-level auth boundary for the new DPA surface.
 */

import { expect, test } from "./fixtures/auth-fixture"

const DUMMY_TENANT = "00000000-0000-0000-0000-000000000000"
const DPA = `/api/tenants/${DUMMY_TENANT}/ai-providers/azure/dpa`

test.describe("PROJ-93 / DPA attest surface auth-gates", () => {
  test("POST attest is auth-gated", async ({ request }) => {
    const res = await request.post(DPA, {
      data: { reference: "MSFT-DPA-2026-0042" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401, 403]).toContain(res.status())
  })

  test("DELETE revoke is auth-gated", async ({ request }) => {
    const res = await request.delete(DPA, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401, 403]).toContain(res.status())
  })

  test("POST attest with a missing reference is still auth-gated (gate before validation)", async ({
    request,
  }) => {
    // An invalid body must not leak past the auth gate.
    const res = await request.post(DPA, {
      data: {},
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401, 403]).toContain(res.status())
  })

  test("DPA on a non-azure provider is still auth-gated (gate before provider guard)", async ({
    request,
  }) => {
    const res = await request.post(
      `/api/tenants/${DUMMY_TENANT}/ai-providers/openai/dpa`,
      { data: { reference: "x" }, failOnStatusCode: false, maxRedirects: 0 },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  test("AI-providers settings page (hosts the attest card) is auth-gated", async ({
    page,
  }) => {
    const res = await page.goto("/settings/tenant/ai-providers", {
      waitUntil: "domcontentloaded",
    })
    // Middleware redirects unauthenticated users to /login.
    expect(page.url()).toContain("/login")
    if (res) expect([200, 307, 401, 403]).toContain(res.status())
  })
})
