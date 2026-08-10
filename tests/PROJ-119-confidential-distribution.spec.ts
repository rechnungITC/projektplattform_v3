/**
 * PROJ-119 — Vertraulichkeitsgesteuerte Verteilung: auth-gates.
 *
 * Guards the HTTP surface added by this slice: content read, inner-circle
 * management (list/toggle/add/remove), break-glass dissolve, embargo, the gated
 * export/print endpoint and the access log.
 *
 * The security behaviour itself — inner circle beating the tenant-admin bypass,
 * the aggregate-leak probe, the B1 write-path fix, embargo blocking, append-only
 * logging, cross-tenant isolation — is proven by the live SQL pentest A–N 14/14
 * (0 residue, tests/sql/PROJ-119-confidential-distribution-pentest.sql), plus
 * the byte-identical regressions PROJ-118 9/9, PROJ-100a 7/7 and PROJ-100b 8/8.
 */

import { expect, test } from "@playwright/test"

const D = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]
const base = `/api/projects/${D}/communication-entries`

test.describe("PROJ-119 / confidential distribution auth-gates", () => {
  test("GET content is auth-gated", async ({ request }) => {
    const res = await request.get(`${base}/${D}/content`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET inner-circle members is auth-gated", async ({ request }) => {
    const res = await request.get(`${base}/${D}/inner-circle`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST inner-circle toggle is auth-gated", async ({ request }) => {
    const res = await request.post(`${base}/${D}/inner-circle`, {
      data: { enabled: true },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PUT inner-circle member is auth-gated", async ({ request }) => {
    const res = await request.put(`${base}/${D}/inner-circle`, {
      data: { user_id: D },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("DELETE inner-circle member is auth-gated", async ({ request }) => {
    const res = await request.delete(`${base}/${D}/inner-circle?user_id=${D}`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST dissolve (break-glass) is auth-gated", async ({ request }) => {
    const res = await request.post(`${base}/${D}/dissolve`, {
      data: { reason: "probe" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST embargo is auth-gated", async ({ request }) => {
    const res = await request.post(`${base}/${D}/embargo`, {
      data: { embargo_at: "2026-09-01T08:00:00Z" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET export is auth-gated", async ({ request }) => {
    const res = await request.get(`${base}/${D}/export?as=csv`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET print view is auth-gated", async ({ request }) => {
    const res = await request.get(`${base}/${D}/export?as=print`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET access log is auth-gated", async ({ request }) => {
    const res = await request.get(`${base}/${D}/access-log`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("an unauthenticated export never leaks entry content", async ({ request }) => {
    const res = await request.get(`${base}/${D}/export?as=csv`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
    const body = await res.text()
    expect(body).not.toContain("Botschaft")
    expect(body).not.toContain("target_group_key")
  })
})
