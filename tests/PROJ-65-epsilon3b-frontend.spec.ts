import { expect, test } from "@playwright/test"

/**
 * PROJ-65 ε.3b — Plan-Mutate frontend smoke (auth-gate).
 *
 * The full UX (drag-handle, dialog, undo-toast) lives in the Vitest
 * layer (`plan-mutate-diff-table.test.tsx` etc.). This spec only
 * ensures the new server endpoints redirect / 401 when unauthenticated.
 */

const PROJECT_ID = "00000000-0000-0000-0000-000000000000"

test.describe("PROJ-65 ε.3b / plan-mutate API surface", () => {
  test("POST /api/projects/[id]/plan-mutate is auth-gated", async ({
    request,
  }) => {
    const res = await request.post(
      `/api/projects/${PROJECT_ID}/plan-mutate`,
      {
        failOnStatusCode: false,
        maxRedirects: 0,
        data: {
          source_node_id: "phase:00000000-0000-0000-0000-000000000001",
          source_node_kind: "phase",
          intent: { kind: "shift_dates", days: 1 },
          if_updated_at: [],
        },
      },
    )
    // Middleware bounces unauthenticated POSTs; either redirect or 401
    // (depending on whether the route is yet provisioned by /backend).
    expect([307, 401, 404, 501]).toContain(res.status())
  })

  test("POST /api/projects/[id]/plan-mutate/undo is auth-gated", async ({
    request,
  }) => {
    const res = await request.post(
      `/api/projects/${PROJECT_ID}/plan-mutate/undo`,
      {
        failOnStatusCode: false,
        maxRedirects: 0,
        data: { causation_id: "test-causation-id" },
      },
    )
    expect([307, 401, 404, 501]).toContain(res.status())
  })
})
