/**
 * PROJ-107 — Risk Register (M&A) auth-gates.
 *
 * Guards the HTTP surface of the new PROJ-107 additions: the tenant
 * risk-categories catalog (list/create + detail patch/delete), the
 * project-scoped category list (form data source + M&A lazy-seed), and the
 * Stammdaten catalog page. Need-to-know DEPTH on the shared `risks` table
 * (RESTRICTIVE can_access_classified gate: default-deny / standard-transparent
 * / ordered-clearance / cross-tenant / write-gate / linked_risk_id aggregate
 * no-leak), risk_links work_item/deliverable validation, seed idempotency and
 * audit coverage are proven by the live SQL pentest (tests/sql/PROJ-107-...,
 * A-J 10/10, 0 residue).
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-107 / Risk Register auth-gates", () => {
  test("the /stammdaten/risikokategorien page is auth-gated", async ({ request }) => {
    const res = await request.get(`/stammdaten/risikokategorien`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET /api/risk-categories is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/risk-categories`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST /api/risk-categories is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/risk-categories`, {
      data: { key: "legal", label: "Legal" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PATCH /api/risk-categories/[id] is auth-gated", async ({ request }) => {
    const res = await request.patch(`/api/risk-categories/${DUMMY}`, {
      data: { label: "Legal (edit)" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("DELETE /api/risk-categories/[id] is auth-gated", async ({ request }) => {
    const res = await request.delete(`/api/risk-categories/${DUMMY}`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET /api/projects/[id]/risk-categories is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${DUMMY}/risk-categories`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST .../risks with M&A fields is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${DUMMY}/risks`, {
      data: {
        title: "R",
        probability: 3,
        impact: 3,
        category_id: DUMMY,
        confidentiality_level: "strict",
      },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})
