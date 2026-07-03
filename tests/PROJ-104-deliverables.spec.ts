/**
 * PROJ-104 — Deliverables auth-gates.
 *
 * Guards the HTTP surface: the /projects/[id]/deliverables page + the 5 API
 * routes (list/create, detail, status, documents, raci). Need-to-know DEPTH
 * (RESTRICTIVE gate: non-cleared member can't see strict deliverables/docs,
 * aggregate-leak excluded from the dashboard) + status/RACI/cascade behaviour
 * are proven by the live SQL smoke + aggregate-leak pentest (A-E, 0 residue).
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-104 / Deliverables auth-gates", () => {
  test("the /deliverables page route is auth-gated", async ({ request }) => {
    const res = await request.get(`/projects/${DUMMY}/deliverables`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET .../deliverables is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/deliverables`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../deliverables is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${DUMMY}/deliverables`, {
      data: { name: "LOI", workstream_id: DUMMY },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PATCH .../deliverables/[did]/status is auth-gated", async ({ request }) => {
    const res = await request.patch(
      `/api/projects/${DUMMY}/deliverables/${DUMMY}/status`,
      { data: { to_status: "in_progress" }, failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST .../deliverables/[did]/documents is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY}/deliverables/${DUMMY}/documents`,
      { data: { title: "X", url: "https://x/y" }, failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST .../deliverables/[did]/raci is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY}/deliverables/${DUMMY}/raci`,
      { data: { role_key: "deal_lead", raci_letter: "A" }, failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })
})
