/**
 * PROJ-118 — Kommunikationsmatrix auth-gates.
 *
 * Guards the HTTP surface: entry CRUD, submit/respond/mark-sent workflow, and
 * the template routes (list/create/seed). The RPC behaviour (create→draft,
 * submit, SoD block, approve→sent + immutable, non-manager block, need-to-know
 * hide→grant, cross-tenant isolation, templates seed/idempotent/create, audit)
 * is proven by the live SQL smoke A–I 9/9 (0 residue,
 * tests/sql/PROJ-118-communication-matrix-pentest.sql).
 */

import { expect, test } from "@playwright/test"

const D = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]
const entries = `/api/projects/${D}/communication-entries`
const templates = `/api/projects/${D}/communication-templates`

test.describe("PROJ-118 / communication entries auth-gates", () => {
  test("GET entries list is auth-gated", async ({ request }) => {
    const res = await request.get(entries, { failOnStatusCode: false, maxRedirects: 0 })
    expect(GATE).toContain(res.status())
  })
  test("POST entry create is auth-gated", async ({ request }) => {
    const res = await request.post(entries, {
      data: { target_group_key: "mitarbeiter" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
  test("PATCH entry is auth-gated", async ({ request }) => {
    const res = await request.patch(`${entries}/${D}`, {
      data: { message: "x" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
  test("DELETE entry is auth-gated", async ({ request }) => {
    const res = await request.delete(`${entries}/${D}`, { failOnStatusCode: false, maxRedirects: 0 })
    expect(GATE).toContain(res.status())
  })
  test("POST submit is auth-gated", async ({ request }) => {
    const res = await request.post(`${entries}/${D}/submit`, { failOnStatusCode: false, maxRedirects: 0 })
    expect(GATE).toContain(res.status())
  })
  test("POST respond is auth-gated", async ({ request }) => {
    const res = await request.post(`${entries}/${D}/respond`, {
      data: { approved: true },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
  test("POST mark-sent is auth-gated", async ({ request }) => {
    const res = await request.post(`${entries}/${D}/mark-sent`, { failOnStatusCode: false, maxRedirects: 0 })
    expect(GATE).toContain(res.status())
  })
})

test.describe("PROJ-118 / communication templates auth-gates", () => {
  test("GET templates is auth-gated", async ({ request }) => {
    const res = await request.get(templates, { failOnStatusCode: false, maxRedirects: 0 })
    expect(GATE).toContain(res.status())
  })
  test("POST template create is auth-gated", async ({ request }) => {
    const res = await request.post(templates, {
      data: { template_key: "x", name: "X" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
  test("POST templates seed is auth-gated", async ({ request }) => {
    const res = await request.post(`${templates}/seed`, { failOnStatusCode: false, maxRedirects: 0 })
    expect(GATE).toContain(res.status())
  })
})

test.describe("PROJ-118 / Kommunikation page auth-gate", () => {
  test("page redirects unauthenticated to login", async ({ request }) => {
    const res = await request.get(`/projects/${D}/kommunikationsmatrix`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect([307, 401, 403]).toContain(res.status())
  })
})
