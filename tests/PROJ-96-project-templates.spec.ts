/**
 * PROJ-96 — M&A project-template auth-gates.
 *
 * Unauthenticated probes on the tenant-scoped template catalog API, the
 * project-scoped apply-template API, and the admin catalog page. Authorization
 * DEPTH (admin/lead-only apply, non-member seed block, cross-tenant template
 * isolation, single-use re-apply block, non-M&A rejection, anon execute
 * revoked) is proven by the live pentest documented in the feature spec
 * (6/6 vectors PASS, 0 residue) against apply_ma_project_template +
 * ensure_default_ma_project_templates. This spec guards the HTTP surface so
 * nothing is reachable without a session.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-96 / M&A project-template auth-gates", () => {
  test("GET /api/ma-project-templates is auth-gated", async ({ request }) => {
    const res = await request.get(`/api/ma-project-templates`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../apply-template is auth-gated", async ({ request }) => {
    const res = await request.post(`/api/projects/${DUMMY}/apply-template`, {
      data: { templateId: DUMMY },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  // Unauthenticated, even a malformed project id is stopped by the middleware
  // auth-gate before the route's Zod uuid check runs. The 400 validation path
  // is covered by the route unit tests.
  test("POST .../apply-template with a malformed id is still auth-gated", async ({
    request,
  }) => {
    const res = await request.post(`/api/projects/not-a-uuid/apply-template`, {
      data: { templateId: DUMMY },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("the Projekt-Vorlagen admin page is auth-gated", async ({ request }) => {
    const res = await request.get(`/stammdaten/projekt-vorlagen`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})
