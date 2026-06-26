/**
 * PROJ-112 — Due-Diligence streams auth-gates.
 *
 * Unauthenticated probes on the dd-streams API (list/create/edit/delete/status),
 * the tenant template-catalog API, and the two pages (project-room
 * /due-diligence + Stammdaten /dd-stream-vorlagen).
 *
 * Authorization DEPTH (the need-to-know confidentiality gate per stream, the
 * write/manage_members gate, the transition-RPC authority (42501), cross-tenant
 * isolation, template tenant isolation, and the audit-read gate) is proven at
 * the backend: the /backend live-RPC smoke (10/10) + the live RLS pen-test
 * tests/sql/PROJ-112-dd-streams-pentest.sql (10/10, run under a real
 * `authenticated` role, 0 residue). This spec guards the HTTP surface so no
 * route or page is reachable without a session.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-112 / dd-streams auth-gates", () => {
  test("GET .../dd-streams is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/dd-streams`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../dd-streams is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${DUMMY}/dd-streams`, {
      data: { stream_key: "legal", label: "Legal" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PATCH .../dd-streams/[streamId] is auth-gated", async ({ request }) => {
    const res = await request.patch(
      `/api/projects/${DUMMY}/dd-streams/${DUMMY}`,
      { data: { label: "x" }, failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("DELETE .../dd-streams/[streamId] is auth-gated", async ({ request }) => {
    const res = await request.delete(
      `/api/projects/${DUMMY}/dd-streams/${DUMMY}`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST .../dd-streams/[streamId]/status is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY}/dd-streams/${DUMMY}/status`,
      { data: { to_status: "started" }, failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("GET /api/dd-stream-templates is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/dd-stream-templates`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST /api/dd-stream-templates is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/dd-stream-templates`, {
      data: { stream_key: "esg", label: "ESG" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PATCH /api/dd-stream-templates/[templateId] is auth-gated", async ({ request }) => {
    const res = await request.patch(`/api/dd-stream-templates/${DUMMY}`, {
      data: { is_active: false },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("project-room /due-diligence page is auth-gated", async ({ request }) => {
    const res = await request.get(`/projects/${DUMMY}/due-diligence`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("Stammdaten /dd-stream-vorlagen page is auth-gated", async ({ request }) => {
    const res = await request.get(`/stammdaten/dd-stream-vorlagen`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})