/**
 * PROJ-78 — Skill-Projektzuordnung auth-gates.
 *
 * Unauthenticated probes on all four new HTTP surfaces plus the in-app
 * "Projekt-Skills" tab. Authorization DEPTH (project-lead vs viewer gate,
 * cross-tenant rejection, inactive-skill rejection, idempotency, audit
 * events + audit readability of the `removed` event, anon EXECUTE revoked,
 * tenant-consistency trigger) is proven by the live pentest
 * tests/sql/PROJ-78-project-skills-pentest.sql (14/14 against prod, 0
 * residue). Route-level status mapping (400/403/404/422) is covered by
 * src/app/api/projects/[id]/skills/route.test.ts.
 *
 * This spec guards the HTTP surface so nothing is reachable without a session.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const SKILL = "11111111-1111-4111-8111-111111111111"
const GATE = [307, 401, 403]

test.describe("PROJ-78 / Projekt-Skills auth-gates", () => {
  test("GET .../skills is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/skills`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../skills is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${DUMMY}/skills`, {
      data: {
        assignments: [
          { skill_id: SKILL, assignment_source: "manual_pm" },
        ],
      },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("DELETE .../skills/[skillId] is auth-gated", async ({ request }) => {
    const res = await request.delete(
      `/api/projects/${DUMMY}/skills/${SKILL}`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  test("GET .../skills/resolve is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/projects/${DUMMY}/skills/resolve`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  // Unauthenticated, even a malformed project id is stopped by the middleware
  // auth-gate (redirect) before the route's Zod uuid check runs. The 400
  // validation path is covered by the route unit test.
  test("POST .../skills with a malformed project id is still auth-gated", async ({
    request,
  }) => {
    const res = await request.post(`/api/projects/not-a-uuid/skills`, {
      data: { assignments: [] },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("the Projekt-Skills tab page is auth-gated", async ({ request }) => {
    const res = await request.get(`/projects/${DUMMY}/skills`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})
