/**
 * PROJ-Y-96e — task-template auth-gates.
 *
 * Unauthenticated probes on the surfaces touched by the /backend + /frontend
 * slice: the extended template catalog API (now returns tasks[]), the
 * apply-template API (RPC response now carries tasks_created / subtasks_created
 * / warnings[]), and the admin catalog page (renders the new Tasks section).
 *
 * Authorization DEPTH (admin/lead-only apply, non-member seed block, cross-
 * tenant template isolation, single-use re-apply block, non-M&A rejection,
 * anon EXECUTE revoked, PROJ-9 validate_work_item_parent compat, idempotent
 * task-seed, orphan subtask cascade with warnings[], provenance stamp) is
 * proven by the live pentest in tests/sql/PROJ-Y-96e-task-templates-pentest.sql
 * (11/11 vectors A-K PASS against Prod, 0 residue via RAISE-Rollback). This
 * spec guards the HTTP surface so nothing is reachable without a session.
 *
 * Regression: PROJ-96 catalog + apply endpoint auth-gates remain covered by
 * tests/PROJ-96-project-templates.spec.ts (byte-identical).
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-Y-96e / task-template auth-gates", () => {
  test("GET /api/ma-project-templates (extended with tasks[]) is auth-gated", async ({
    request,
  }) => {
    const res = await request.get(`/api/ma-project-templates`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../apply-template (extended RPC response) is auth-gated", async ({
    request,
  }) => {
    const res = await request.post(`/api/projects/${DUMMY}/apply-template`, {
      data: { templateId: DUMMY },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("the Projekt-Vorlagen admin page (Tasks section) is auth-gated", async ({
    request,
  }) => {
    const res = await request.get(`/stammdaten/projekt-vorlagen`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  // Unauthenticated, an empty POST body is stopped by the auth-gate before the
  // route's Zod check runs; a 400 body-shape response would leak that the route
  // exists AND parsed the body.
  test("POST .../apply-template with an empty body is still auth-gated", async ({
    request,
  }) => {
    const res = await request.post(`/api/projects/${DUMMY}/apply-template`, {
      data: {},
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})
