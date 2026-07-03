/**
 * PROJ-98 — committees & steering bodies auth-gates.
 *
 * Unauthenticated probes on the committees CRUD + membership routes + the
 * in-app Gremien page. Authorization DEPTH (manager-gating, need-to-know,
 * cross-tenant isolation, anon execute revoked, H5 stakeholder-project
 * consistency, audit) is proven by the live pentest
 * tests/sql/PROJ-98-committees-pentest.sql (A–J 10/10) on the SECURITY DEFINER
 * RPCs. This spec guards the HTTP surface so nothing is reachable without a
 * session.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-98 / committees auth-gates", () => {
  test("GET .../committees is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/committees`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../committees is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${DUMMY}/committees`, {
      data: { name: "SteerCo" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PATCH .../committees/[committeeId] is auth-gated", async ({ request }) => {
    const res = await request.patch(`/api/projects/${DUMMY}/committees/${DUMMY}`, {
      data: { name: "SteerCo" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("DELETE .../committees/[committeeId] is auth-gated", async ({ request }) => {
    const res = await request.delete(`/api/projects/${DUMMY}/committees/${DUMMY}`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../committees/[committeeId]/members is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY}/committees/${DUMMY}/members`,
      {
        data: { stakeholder_id: DUMMY },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect(GATE).toContain(res.status())
  })

  test("PATCH .../members/[memberId] is auth-gated", async ({ request }) => {
    const res = await request.patch(
      `/api/projects/${DUMMY}/committees/${DUMMY}/members/${DUMMY}`,
      {
        data: { is_voting: false },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect(GATE).toContain(res.status())
  })

  test("DELETE .../members/[memberId] is auth-gated", async ({ request }) => {
    const res = await request.delete(
      `/api/projects/${DUMMY}/committees/${DUMMY}/members/${DUMMY}`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("the Gremien page is auth-gated", async ({ request }) => {
    const res = await request.get(`/projects/${DUMMY}/gremien`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})
