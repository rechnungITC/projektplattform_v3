/**
 * PROJ-115 — external document links auth-gates.
 *
 * Unauthenticated probes on the polymorphic external-links route (GET/POST/
 * DELETE). Authorization DEPTH (need-to-know inheritance across all 4 entity
 * types, aggregate-leak-free, RESTRICTIVE insert gate, parent guard, https
 * CHECK, cross-tenant isolation, parent-delete cleanup) is proven by the live
 * pentest tests/sql/PROJ-115-external-links-pentest.sql (A–I 9/9). This spec
 * guards the HTTP surface so nothing is reachable without a session.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-115 / external-links auth-gates", () => {
  test("GET .../external-links is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${DUMMY}/external-links?entity_type=deliverable&entity_id=${DUMMY}`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST .../external-links is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${DUMMY}/external-links`, {
      data: { entity_type: "deliverable", entity_id: DUMMY, url: "https://vdr.example/x" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("DELETE .../external-links is auth-gated", async ({ request }) => {
    const res = await request.delete(
      `/api/projects/${DUMMY}/external-links?link_id=${DUMMY}`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST with a malformed project id is still auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/not-a-uuid/external-links`, {
      data: {},
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})
