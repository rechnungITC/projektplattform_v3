/**
 * PROJ-117 — Committee meetings + templates auth-gates.
 *
 * Guards the HTTP surface: meeting CRUD, attendees, documents, commit, the ICS
 * export, and the committee-template routes. The RPC behaviour (floor-lift,
 * cross-project reject, commit→neutral decisions+tasks+outcomes without minutes
 * leak, need-to-know hide→grant, cross-tenant isolation, templates seed/apply,
 * audit) is proven by the live SQL smoke A–I 9/9 (0 residue,
 * tests/sql/PROJ-117-committee-meetings-pentest.sql).
 */

import { expect, test } from "@playwright/test"

const D = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]
const base = `/api/projects/${D}/committees/${D}/meetings`

test.describe("PROJ-117 / committee meetings auth-gates", () => {
  test("GET meetings list is auth-gated", async ({ request }) => {
    const res = await request.get(base, { failOnStatusCode: false, maxRedirects: 0 })
    expect(GATE).toContain(res.status())
  })
  test("POST meetings create is auth-gated", async ({ request }) => {
    const res = await request.post(base, {
      data: { title: "X", scheduled_at: "2026-07-21T10:00:00Z" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
  test("GET meeting detail is auth-gated", async ({ request }) => {
    const res = await request.get(`${base}/${D}`, { failOnStatusCode: false, maxRedirects: 0 })
    expect(GATE).toContain(res.status())
  })
  test("PATCH meeting is auth-gated", async ({ request }) => {
    const res = await request.patch(`${base}/${D}`, {
      data: { status: "held" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
  test("DELETE meeting is auth-gated", async ({ request }) => {
    const res = await request.delete(`${base}/${D}`, { failOnStatusCode: false, maxRedirects: 0 })
    expect(GATE).toContain(res.status())
  })
  test("POST attendee is auth-gated", async ({ request }) => {
    const res = await request.post(`${base}/${D}/attendees`, {
      data: { stakeholder_id: D },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
  test("POST document is auth-gated", async ({ request }) => {
    const res = await request.post(`${base}/${D}/documents`, {
      data: { label: "L", url: "https://x/y" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
  test("POST commit minutes is auth-gated", async ({ request }) => {
    const res = await request.post(`${base}/${D}/commit`, {
      data: { decisions: [{ title: "A" }] },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
  test("GET meetings ICS export is auth-gated", async ({ request }) => {
    const res = await request.get(`${base}/ics`, { failOnStatusCode: false, maxRedirects: 0 })
    expect(GATE).toContain(res.status())
  })
})

test.describe("PROJ-117 / committee templates auth-gates", () => {
  test("GET templates is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${D}/committee-templates`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
  test("POST template create is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${D}/committee-templates`, {
      data: { template_key: "x", name: "X" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
  test("POST templates seed is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${D}/committee-templates/seed`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
  test("POST committee from-template is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${D}/committees/from-template`, {
      data: { template_id: D },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})
