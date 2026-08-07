/**
 * PROJ-Y-96b — M&A Template-RACI auth-gates + response-shape sanity.
 *
 * Unauthenticated probes for every surface Y-96b touches on top of PROJ-96:
 *   - GET /api/ma-project-templates                       (extended with `raci[]`)
 *   - POST /api/projects/[id]/apply-template              (extended return: raci_created + warnings[])
 *   - POST /api/wizard-drafts/[id]/finalize               (extended payload: template_result)
 *   - GET /stammdaten/projekt-vorlagen                    (extended UI: AC-Y96b.6 RACI matrix section)
 *
 * Authorization DEPTH — template-side single-A partial unique (Vector B),
 * unknown role_key warning (C), orphan target skip (D), cross-tenant RLS
 * isolation (E), non-admin insert 42501 (F), Fork-A1 ON DELETE RESTRICT (G),
 * PROJ-96 base verbatim H, PROJ-104 set_deliverable_raci regression I — is
 * proven by the live pentest in tests/sql/PROJ-Y-96b-ma-template-raci-pentest.sql
 * (9/9 PASS against Prod, 0 residue). This spec guards the HTTP surface so
 * nothing is reachable without a session.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const GATE = [307, 401, 403]

test.describe("PROJ-Y-96b / template-RACI auth-gates", () => {
  test("GET /api/ma-project-templates (extended with raci[]) is auth-gated", async ({
    request,
  }) => {
    const res = await request.get(`/api/ma-project-templates`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../apply-template (raci_created + warnings) is auth-gated", async ({
    request,
  }) => {
    const res = await request.post(`/api/projects/${DUMMY}/apply-template`, {
      data: { templateId: DUMMY },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  test("POST .../wizard-drafts/[id]/finalize (template_result payload) is auth-gated", async ({
    request,
  }) => {
    const res = await request.post(
      `/api/wizard-drafts/${DUMMY}/finalize`,
      {
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect(GATE).toContain(res.status())
  })

  test("admin catalog /stammdaten/projekt-vorlagen (with RACI matrix, AC-Y96b.6) is auth-gated", async ({
    request,
  }) => {
    const res = await request.get(`/stammdaten/projekt-vorlagen`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  // Y-96b widens `apply_ma_project_template`'s return jsonb with two additive
  // fields. Even a malformed project id is stopped by the middleware auth-gate
  // before the route's Zod uuid check runs — this guarantees no unauthenticated
  // caller can probe the new fields.
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
})
