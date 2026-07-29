/**
 * PROJ-141 α — cross-cutting audit remediation auth-gates.
 *
 * α closes 1 HIGH (H-1 RLS) + 4 MEDIUM (M-9 If-Match, M-10 activate-guard,
 * M-11 audit events + discard) + 1 LOW (L-3 422) from the 2026-07-28 audit
 * of the deployed PROJ-77 / PROJ-96 / PROJ-132 slices.
 *
 * Authorization DEPTH is proven separately against prod:
 *   - tests/sql/PROJ-141-alpha1-skill-versions-rls-pentest.sql (8/8 PASS):
 *     H-1 fix — non-admin members can no longer SELECT drafts/archived
 *     skill_versions of active skills; admin unchanged.
 *   - tests/sql/PROJ-141-alpha3-alpha4-state-machine-and-discard-pentest.sql
 *     (11/11 PASS): α3 archived→active reject (P0001), α4a published audit,
 *     α4b discard_skill_draft admin-gate + discard audit + status='draft'-only.
 *   - Route-unit tests (src/app/api/skills/[id]/versions/[vid]/route.test.ts):
 *     PATCH 428 If-Match missing, PATCH 422 unknown allowed_action,
 *     DELETE full status-code matrix (400/401/403/404/409/204).
 *   - Route-unit tests (src/app/api/skills/[id]/versions/route.test.ts):
 *     POST 422 unknown allowed_action.
 *   - Regression PROJ-76 RLS 11/11 + PROJ-77-α immutability 4/4 stay green.
 *
 * This spec guards that the new + hardened surface is unreachable without a
 * session, matching the PROJ-76 / PROJ-77-α auth-gate pattern.
 */

import { expect, test } from "@playwright/test"

const DUMMY = "00000000-0000-0000-0000-000000000000"
const VID = "11111111-1111-4111-8111-111111111111"
const GATE = [307, 401, 403]

test.describe("PROJ-141-α / cross-cutting audit remediation auth-gates", () => {
  // ---- α4 M-11: NEW endpoint (discard draft) ----

  test("DELETE /api/skills/[id]/versions/[vid] is auth-gated (α4 discard)", async ({
    request,
  }) => {
    const res = await request.delete(
      `/api/skills/${DUMMY}/versions/${VID}`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  // ---- α2 M-9: If-Match required — no header ----

  test("PATCH .../versions/[vid] without If-Match is auth-gated (α2)", async ({
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

  // ---- α3 M-10: activate now rejects archived (P0001 → 409) ----

  test("POST .../versions/[vid]/activate is auth-gated (α3 archived guard)", async ({
    request,
  }) => {
    const res = await request.post(
      `/api/skills/${DUMMY}/versions/${VID}/activate`,
      { failOnStatusCode: false, maxRedirects: 0 }
    )
    expect(GATE).toContain(res.status())
  })

  // ---- α5 L-3: 422 for unknown allowed_action on POST /versions ----

  test("POST .../versions with unknown allowed_action is auth-gated (α5)", async ({
    request,
  }) => {
    const res = await request.post(`/api/skills/${DUMMY}/versions`, {
      data: {
        markdown_body: "x",
        frontmatter: {
          name: "X",
          slug: "x",
          category: "method",
          allowed_actions: ["not_a_real_action"],
        },
      },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })

  // ---- α5 L-3: 422 for unknown allowed_action on POST /skills ----

  test("POST /api/skills with unknown allowed_action is auth-gated (α5)", async ({
    request,
  }) => {
    const res = await request.post("/api/skills", {
      data: {
        name: "X",
        slug: "x",
        category: "method",
        markdown_body: "x",
        frontmatter: {
          name: "X",
          slug: "x",
          category: "method",
          allowed_actions: ["not_a_real_action"],
        },
      },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    expect(GATE).toContain(res.status())
  })
})
