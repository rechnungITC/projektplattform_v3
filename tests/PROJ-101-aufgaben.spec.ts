/**
 * PROJ-101 — M&A "Aufgaben" auth-gates.
 *
 * The feature reuses the deployed work-items API (GET/POST/PATCH + /status),
 * which already carries auth + validation coverage in vitest. This spec guards
 * the NEW HTTP surface: the /projects/[id]/aufgaben page route and the new GET
 * list filters (responsible_user_id / phase_id / due_after / due_before) — none
 * reachable without a session. Filter-validation (400) and the due_date /
 * filter / My-Work behaviour are proven by the live DB smoke (0 residue) +
 * the +5 vitest GET-filter tests.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-101 / Aufgaben auth-gates", () => {
  test("the /aufgaben page route is auth-gated", async ({ request }) => {
    const res = await request.get(`/projects/${DUMMY}/aufgaben`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET work-items with PROJ-101 filters is auth-gated", async ({
    request,
  }) => {
    const res = await request.get(
      `/api/projects/${DUMMY}/work-items` +
        `?kind=task&responsible_user_id=${DUMMY}&phase_id=${DUMMY}` +
        `&due_after=2026-07-01&due_before=2026-07-31`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST work-items (create task) is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${DUMMY}/work-items`, {
      data: { kind: "task", title: "X", due_date: "2026-07-15" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PATCH work-item status is auth-gated", async ({ request }) => {
    const res = await request.patch(
      `/api/projects/${DUMMY}/work-items/${DUMMY}/status`,
      {
        data: { status: "in_progress" },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect(GATE).toContain(res.status())
  })
})
