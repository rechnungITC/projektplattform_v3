/**
 * PROJ-76 — Skill-Framework auth-gates (HTTP surface).
 *
 * Unauthenticated probes on every new route + API endpoint. Authorization
 * DEPTH is proven separately against prod:
 *   - RLS role pentest tests/sql/PROJ-76-skill-framework-rls-pentest.sql
 *     (11/11: member active-only, non-admin write blocked, admin-gate on the
 *     activate RPC, tenant isolation via non-member sees 0, admin sees all).
 *   - RPC state-machine smoke tests/sql/PROJ-76-skill-framework-rpc-smoke.sql
 *     (8/8: activate/single-active-demote, content + status immutability,
 *     rollback content-copy, idempotent re-activate, admin-gate, audit).
 * This spec guards that nothing is reachable without a session.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const VID = "11111111-1111-4111-8111-111111111111"
const GATE = [307, 401, 403]

test.describe("PROJ-76 / Skill-Framework auth-gates", () => {
  // ---- Pages ----
  test("PM catalog /skills is auth-gated", async ({ request }) => {
    const res = await request.get("/skills", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("admin list /stammdaten/skills is auth-gated", async ({ request }) => {
    const res = await request.get("/stammdaten/skills", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("admin detail /stammdaten/skills/[id] is auth-gated", async ({
    request,
  }) => {
    const res = await request.get(`/stammdaten/skills/${DUMMY}`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  // ---- API: collection ----
  test("GET /api/skills is auth-gated", async ({ request }) => {
    const res = await request.get("/api/skills", {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST /api/skills is auth-gated", async ({ request }) => {
    const res = await request.post("/api/skills", {
      data: { name: "X", slug: "x", category: "method" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  // ---- API: single skill ----
  test("GET /api/skills/[id] is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/skills/${DUMMY}`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("PATCH /api/skills/[id] is auth-gated", async ({ request }) => {
    const res = await request.patch(`/api/skills/${DUMMY}`, {
      data: { name: "Y" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST /api/skills/[id]/toggle-active is auth-gated", async ({
    request,
  }) => {
    const res = await request.post(`/api/skills/${DUMMY}/toggle-active`, {
      data: { is_active: true },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  // ---- API: versions ----
  test("GET /api/skills/[id]/versions is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/skills/${DUMMY}/versions`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST /api/skills/[id]/versions is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/skills/${DUMMY}/versions`, {
      data: { markdown_body: "x" },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../versions/[vid]/activate is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/skills/${DUMMY}/versions/${VID}/activate`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("POST .../versions/[vid]/rollback is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/skills/${DUMMY}/versions/${VID}/rollback`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })
})
