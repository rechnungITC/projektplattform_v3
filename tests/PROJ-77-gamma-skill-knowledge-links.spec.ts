/**
 * PROJ-77-γ — auth-gate for the skill_knowledge_links CRUD routes.
 *
 * Authorization DEPTH is proven against prod by
 * tests/sql/PROJ-77-gamma-skill-knowledge-links-smoke.sql (7/7): links are
 * admin-only; a cross-tenant document node is rejected by the SECURITY DEFINER
 * tenant-consistency trigger; duplicates are rejected; a non-admin member
 * cannot read/write; a non-member sees nothing. This spec guards that the HTTP
 * surface is unreachable without a session.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const LID = "11111111-1111-4111-8111-111111111111"
const NODE = "22222222-2222-4222-8222-222222222222"
const GATE = [307, 401, 403]

test.describe("PROJ-77-γ / skill_knowledge_links auth-gates", () => {
  test("GET .../knowledge-links is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/skills/${DUMMY}/knowledge-links`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../knowledge-links is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/skills/${DUMMY}/knowledge-links`, {
      data: { document_node_id: NODE, link_mode: "reference" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PATCH .../knowledge-links/[lid] is auth-gated", async ({ request }) => {
    const res = await request.patch(
      `/api/skills/${DUMMY}/knowledge-links/${LID}`,
      {
        data: { include_subtree: true },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect(GATE).toContain(res.status())
  })

  test("DELETE .../knowledge-links/[lid] is auth-gated", async ({ request }) => {
    const res = await request.delete(
      `/api/skills/${DUMMY}/knowledge-links/${LID}`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })
})
