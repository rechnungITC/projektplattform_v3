/**
 * PROJ-113 — DD Q&A auth-gates.
 *
 * Unauthenticated probes on the dd-questions API (list/create/edit/delete/status
 * /CSV-export). The page surface is the DD overview (PROJ-112 /due-diligence),
 * already auth-gated by its own spec; the Q&A sheet mounts inside it.
 *
 * Authorization DEPTH (per-question confidentiality FLOOR, the RESTRICTIVE gate
 * on SELECT/INSERT/UPDATE/DELETE, the status-RPC clearance re-check (42501),
 * cross-tenant isolation, export RLS-completeness, audit visibility) is proven
 * by the live RLS pen-test tests/sql/PROJ-113-dd-questions-pentest.sql (13/13
 * under a real `authenticated` role, 0 residue) + the backend live-RPC smoke.
 * This spec guards the HTTP surface so no route is reachable without a session.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-113 / dd-questions auth-gates", () => {
  test("GET .../dd-questions is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/dd-questions`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../dd-questions is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${DUMMY}/dd-questions`, {
      data: { dd_stream_id: DUMMY, title: "Q" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PATCH .../dd-questions/[questionId] is auth-gated", async ({ request }) => {
    const res = await request.patch(
      `/api/projects/${DUMMY}/dd-questions/${DUMMY}`,
      { data: { title: "x" }, failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("DELETE .../dd-questions/[questionId] is auth-gated", async ({ request }) => {
    const res = await request.delete(
      `/api/projects/${DUMMY}/dd-questions/${DUMMY}`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST .../dd-questions/[questionId]/status is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY}/dd-questions/${DUMMY}/status`,
      { data: { to_status: "in_answering" }, failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("GET .../dd-questions/export is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/dd-questions/export`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})
