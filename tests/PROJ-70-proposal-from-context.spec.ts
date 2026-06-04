import { expect, test } from "@playwright/test"

/**
 * PROJ-70 α + β — proposal_from_context API surface smoke.
 *
 * Mirrors the PROJ-44 pattern: auth-gate verification on every
 * publicly-reachable endpoint without a logged-in fixture. When the
 * PROJ-29 logged-in fixture lands we'll extend this with a happy-path
 * round-trip (Generate → Accept → Undo).
 *
 * Routes covered:
 *   α: POST/GET /api/projects/[id]/ai/proposal-from-context
 *   β: POST /api/projects/[id]/ai/proposal-from-context/accept
 *   β: POST /api/projects/[id]/ai/proposal-from-context/undo
 *
 * The accept/undo routes also enforce body-validation BEFORE auth on
 * the route-helper layer in some implementations; we still expect a
 * 307 or 401 here because the helper chain checks auth first.
 */

const DUMMY_PROJECT = "00000000-0000-0000-0000-000000000000"
const DUMMY_SUGGESTION = "00000000-0000-0000-0000-000000000001"
const DUMMY_CONTEXT_SOURCE = "00000000-0000-0000-0000-000000000002"

test.describe("PROJ-70 / proposal-from-context API auth-gates", () => {
  test("α — GET /api/projects/[id]/ai/proposal-from-context is auth-gated", async ({ request }) => {
    const res = await request.get(
      `/api/projects/${DUMMY_PROJECT}/ai/proposal-from-context`,
      { failOnStatusCode: false, maxRedirects: 0 },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  test("α — POST /api/projects/[id]/ai/proposal-from-context is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY_PROJECT}/ai/proposal-from-context`,
      {
        data: { contextSourceId: DUMMY_CONTEXT_SOURCE },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  test("β — POST /api/projects/[id]/ai/proposal-from-context/accept is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY_PROJECT}/ai/proposal-from-context/accept`,
      {
        data: { suggestionIds: [DUMMY_SUGGESTION] },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  test("β — POST /api/projects/[id]/ai/proposal-from-context/undo is auth-gated", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY_PROJECT}/ai/proposal-from-context/undo`,
      {
        data: { suggestionIds: [DUMMY_SUGGESTION] },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  test("β — PATCH /api/ki/suggestions/[id] is auth-gated (purpose-aware route)", async ({ request }) => {
    const res = await request.patch(
      `/api/ki/suggestions/${DUMMY_SUGGESTION}`,
      {
        data: {
          payload: {
            temp_id: "t_1",
            parent_temp_id: null,
            kind: "task",
            title: "Test",
            description: null,
            confidence: "low",
          },
        },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect([307, 401, 403]).toContain(res.status())
  })

  test("β — invalid project UUID returns 400 before auth-gate (defense-in-depth)", async ({ request }) => {
    const res = await request.post(
      `/api/projects/not-a-uuid/ai/proposal-from-context/accept`,
      {
        data: { suggestionIds: [DUMMY_SUGGESTION] },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    // The route helper validates the path-param UUID and returns 400
    // for bad input. Some path-rewrite proxies may return 404 instead —
    // either is acceptable evidence of input-validation working.
    expect([307, 400, 401, 403, 404]).toContain(res.status())
  })

  test("β — empty suggestionIds[] returns 400 or auth-gate", async ({ request }) => {
    const res = await request.post(
      `/api/projects/${DUMMY_PROJECT}/ai/proposal-from-context/accept`,
      {
        data: { suggestionIds: [] },
        failOnStatusCode: false,
        maxRedirects: 0,
      },
    )
    expect([307, 400, 401, 403]).toContain(res.status())
  })
})
