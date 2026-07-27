/**
 * PROJ-77-α — auth-gate for the new draft-edit PATCH route.
 *
 * The rest of the skill HTTP surface (list/create/activate/rollback/toggle +
 * the pages) is already guarded by tests/PROJ-76-skill-framework.spec.ts.
 * Authorization DEPTH for α is proven against prod:
 *   - tests/sql/PROJ-77-alpha-security-pentest.sql (4/4): a non-admin member
 *     CANNOT edit a draft (0 rows via RLS admin-gate) even though the relaxed
 *     trigger structurally allows draft edits; admin can; archived/promotion
 *     stay blocked (23514).
 *   - tests/sql/PROJ-77-alpha-draft-immutability-smoke.sql (4/4) + the PROJ-76
 *     rpc-smoke (8/8) + rls-pentest (11/11), all re-run green under the α trigger.
 * This spec guards that the new PATCH endpoint is unreachable without a session.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const VID = "11111111-1111-4111-8111-111111111111"
const GATE = [307, 401, 403]

test.describe("PROJ-77-α / draft-edit PATCH auth-gate", () => {
  test("PATCH /api/skills/[id]/versions/[vid] is auth-gated", async ({
    request,
  }) => {
    const res = await request.patch(
      `/api/skills/${DUMMY}/versions/${VID}`,
      {
        data: { markdown_body: "x" },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect(GATE).toContain(res.status())
  })

  test("PATCH with an If-Match header is still auth-gated", async ({
    request,
  }) => {
    const res = await request.patch(
      `/api/skills/${DUMMY}/versions/${VID}`,
      {
        data: { markdown_body: "x" },
        headers: { "If-Match": "2026-01-01T00:00:00Z" },
        failOnStatusCode: false,
        maxRedirects: 0,
      }
    )
    expect(GATE).toContain(res.status())
  })
})
