/**
 * PROJ-Y-5a — auth-gates for the surfaces this slice adds.
 *
 * Written during the /qa pass, because the slice shipped **two genuinely new
 * API routes with no auth-gate coverage at all** — the same gap PROJ-45-β and
 * PROJ-155-β.2 each found in their own QA. Authorization DEPTH is proven by the
 * live pentest (tests/sql/PROJ-Y-5a-project-context-pentest.sql, A–U 22/22
 * against Prod, 0 residue); this spec guards the HTTP surface so nothing is
 * reachable without a session.
 *
 * The assertion is EXACTLY 307, not `[307, 401, 403]`. The loose form passes
 * even when a route does not exist, which is how a green auth-gate test can
 * guard nothing at all (PROJ-45-β QA sharpened the same assertion for the same
 * reason).
 *
 * And the last case states the limit of this whole file out loud: an invented
 * path answers 307 as well, so a 307 proves the GATE, never the EXISTENCE of a
 * route. Existence is proven by the build manifest and by the pentest.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"

/** The redirect stub Next.js serves; must not carry any payload of its own. */
async function expectGatedRedirect(res: {
  status: () => number
  text: () => Promise<string>
}) {
  expect(res.status()).toBe(307)
  const body = await res.text()
  // The stub is the login redirect and nothing else. It DOES echo the requested
  // path in `?next=` — that is the caller's own input, not a leak, and asserting
  // its absence was this file's first, wrong version (PROJ-158's QA recorded the
  // same false alarm). What must not appear is any payload of the route itself.
  expect(body.startsWith("/login?next=")).toBe(true)
  expect(body.length).toBeLessThan(200)
  for (const leak of ["summary", "statements", "turns", "coverage", "tenant_id"]) {
    expect(body).not.toContain(leak)
  }
}

test.describe("PROJ-Y-5a / project-context auth-gates", () => {
  test("GET /api/projects/[id]/project-context is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/project-context`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    await expectGatedRedirect(res)
  })

  test("POST .../wizard-drafts/[id]/project-context/next-question is auth-gated", async ({
    request,
  }) => {
    const res = await request.post(
      `/api/wizard-drafts/${DUMMY}/project-context/next-question`,
      { data: {}, failOnStatusCode: false, maxRedirects: 0 },
    )
    await expectGatedRedirect(res)
  })

  // Not new, but this slice rewrote its body (it now creates the context
  // document + initial revision inside the same transaction as the project).
  test("POST .../wizard-drafts/[id]/finalize stays auth-gated", async ({ request }) => {
    const res = await request.post(`/api/wizard-drafts/${DUMMY}/finalize`, {
      data: {},
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    await expectGatedRedirect(res)
  })

  // The control that keeps the three cases above honest: this path does not
  // exist and answers 307 too. Whoever reads a green run here must not conclude
  // that the routes are wired up — only that nothing gets through unauthenticated.
  test("an invented path answers 307 as well — a gate is not an existence proof", async ({
    request,
  }) => {
    const res = await request.get(
      `/api/projects/${DUMMY}/project-context-does-not-exist`,
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect(res.status()).toBe(307)
  })
})
