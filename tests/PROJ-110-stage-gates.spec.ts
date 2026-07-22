/**
 * PROJ-110 + PROJ-111 — Stage-Gate + decision-log auth-gates.
 *
 * Guards the HTTP surface: the /projects/[id]/stage-gates page + the 4 stage-gate
 * API routes (list, seed, prereadiness, decide) + the PROJ-111 decisions CSV
 * export route. The actual RPC behaviour (seed / Freigabe→phase / Abbruch→project
 * canceled / neutral decision + confidential-on-gate / pending-guard / editor +
 * clearance denials / need-to-know hiding / audit / pre-read) is proven by the
 * live SQL smoke A–J 11/11 (tests/sql/PROJ-110-stage-gates-pentest.sql, 0 residue).
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-110 / Stage-Gate auth-gates", () => {
  test("the /stage-gates page route is auth-gated", async ({ request }) => {
    const res = await request.get(`/projects/${DUMMY}/stage-gates`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET .../stage-gates is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/stage-gates`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../stage-gates/seed is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${DUMMY}/stage-gates/seed`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET .../stage-gates/[gid]/prereadiness is auth-gated", async ({
    request,
  }) => {
    const res = await request.get(
      `/api/projects/${DUMMY}/stage-gates/${DUMMY}/prereadiness`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST .../stage-gates/[gid]/decide is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY}/stage-gates/${DUMMY}/decide`,
      { data: { decision: "freigabe" }, failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })
})

test.describe("PROJ-111 / Decision-log export auth-gate", () => {
  test("GET .../decisions/export is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/decisions/export`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})
