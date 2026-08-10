/**
 * PROJ-120 — Bewertungsmodell / Business Case: auth-gates.
 *
 * Unauthenticated probes on every new HTTP surface (valuations list/create,
 * valuation links list/create/delete, and the "Bewertung" project-room page).
 *
 * Authorization DEPTH is proven by the live pentests, not here:
 *  - tests/sql/PROJ-120-valuation-pentest.sql (A–N 16/16): version chain +
 *    single-head invariant, immutability guard, RPC role/clearance re-checks,
 *    need-to-know incl. AGGREGATE-LEAK probe, both-sided link gate, non-M&A
 *    reject, cross-tenant isolation, anon EXECUTE revoke, audit of the flip.
 *  - the PROJ-131 pentest extended with cases H/I (9/9): the steering tile
 *    shows the band to a cleared caller and NOTHING to a non-cleared one.
 *  - tests/sql/PROJ-115-external-links-pentest.sql (A–I 9/9) re-run as a
 *    regression after the 'ma_valuation' resolver branch was added.
 *
 * This spec guards that none of it is reachable without a session.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-120 / valuation auth-gates", () => {
  test("GET .../valuations is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/valuations`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../valuations is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${DUMMY}/valuations`, {
      data: {
        title: "Indikative Bewertung",
        valuation_date: "2026-08-01",
        method: "multiple",
        value_low: 45000000,
        value_high: 55000000,
      },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("GET .../valuations/[vid]/links is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${DUMMY}/valuations/${DUMMY}/links`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST .../valuations/[vid]/links is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY}/valuations/${DUMMY}/links`,
      {
        data: { linked_kind: "dd_finding", linked_id: DUMMY },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect(GATE).toContain(res.status())
  })

  test("DELETE .../valuations/[vid]/links is auth-gated", async ({ request }) => {
    const res = await request.delete(
      `/api/projects/${DUMMY}/valuations/${DUMMY}/links?linkId=${DUMMY}`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST with a malformed project id is still auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/not-a-uuid/valuations`, {
      data: {},
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("the /bewertung project-room page is auth-gated", async ({ request }) => {
    const res = await request.get(`/projects/${DUMMY}/bewertung`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})
