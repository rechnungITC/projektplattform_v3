/**
 * PROJ-139 / 95 / 97 — auth-gate HTTP surface for the M&A phase-model + roles/RACI slices.
 *
 * Unauthenticated probes on the new API routes + the two new project-room pages.
 * Authorization depth + business rules (mandate gate, "Accountable = exactly one",
 * polymorphic target guard, RLS tenant/non-member isolation, suspended state
 * machine) are proven by the live-prod QA smokes documented in the feature specs;
 * this spec guards the HTTP surface so nothing is reachable without a session.
 *
 * D-1 (env deviation, per project convention): the authenticated/service-role
 * E2E layer is not run in a bare worktree without .env.local / storage-state —
 * compensated by the live-prod smokes + vitest (route/unit) + these auth-gates.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-139/95/97 — M&A phase-model + roles/RACI auth-gates", () => {
  // PROJ-95 — phase-model activation
  test("POST .../phase-model/activate is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY}/phase-model/activate`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  // PROJ-97a — responsibility view
  test("GET .../roles is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/roles`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  // PROJ-97b — RACI matrix (GET / POST / DELETE)
  test("GET .../work-items/[wid]/raci is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${DUMMY}/work-items/${DUMMY}/raci`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST .../work-items/[wid]/raci is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY}/work-items/${DUMMY}/raci`,
      {
        data: { role_key: "deal_lead", raci_letter: "A" },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect(GATE).toContain(res.status())
  })

  test("DELETE .../work-items/[wid]/raci is auth-gated", async ({ request }) => {
    const res = await request.delete(
      `/api/projects/${DUMMY}/work-items/${DUMMY}/raci`,
      {
        data: { role_key: "deal_lead" },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect(GATE).toContain(res.status())
  })

  // PROJ-95 / 97 — the two new project-room pages redirect to login unauthenticated.
  test("GET /projects/[id]/phasenmodell redirects unauthenticated", async ({
    request,
  }) => {
    const res = await request.get(`/projects/${DUMMY}/phasenmodell`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 308, 302]).toContain(res.status())
  })

  test("GET /projects/[id]/rollen redirects unauthenticated", async ({
    request,
  }) => {
    const res = await request.get(`/projects/${DUMMY}/rollen`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 308, 302]).toContain(res.status())
  })
})
