/**
 * PROJ-77-β — auth-gate for the skill_examples CRUD routes.
 *
 * Authorization DEPTH is proven against prod by
 * tests/sql/PROJ-77-beta-skill-examples-smoke.sql (6/6): examples are
 * admin-only — a non-admin member cannot read or write them, a non-member
 * sees nothing (tenant isolation), the admin reads+edits, and a field-level
 * audit row is written on update. This spec guards that the HTTP surface is
 * unreachable without a session.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const EID = "11111111-1111-4111-8111-111111111111"
const GATE = [307, 401, 403]

test.describe("PROJ-77-β / skill_examples auth-gates", () => {
  test("GET /api/skills/[id]/examples is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/skills/${DUMMY}/examples`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST /api/skills/[id]/examples is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/skills/${DUMMY}/examples`, {
      data: { title: "T", input: "i", expected_output: "o" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PATCH /api/skills/[id]/examples/[eid] is auth-gated", async ({
    request,
  }) => {
    const res = await request.patch(`/api/skills/${DUMMY}/examples/${EID}`, {
      data: { title: "New" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("DELETE /api/skills/[id]/examples/[eid] is auth-gated", async ({
    request,
  }) => {
    const res = await request.delete(`/api/skills/${DUMMY}/examples/${EID}`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})
