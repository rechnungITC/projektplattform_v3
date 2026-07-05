import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthMock } = vi.hoisted(() => ({ getAuthMock: vi.fn() }))

vi.mock("@/app/api/_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, getAuthenticatedUserId: getAuthMock }
})

import { GET } from "./route"

const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  c.select = vi.fn(() => c)
  c.eq = vi.fn(() => c)
  c.is = vi.fn(() => c)
  c.limit = vi.fn(async () => result)
  return c
}
function supa(result: { data: unknown; error: unknown }) {
  return { from: vi.fn(() => chain(result)) }
}

beforeEach(() => getAuthMock.mockReset())

describe("GET /api/dashboard/deliverable-approvals", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({ data: [], error: null }) })
    expect((await GET()).status).toBe(401)
  })

  it("returns only the active pending stage for the current user", async () => {
    const rows = [
      {
        id: "stage-active",
        stage_order: 1,
        deliverable_approvals: {
          id: "a1",
          status: "pending",
          current_stage_order: 1,
          deliverable_id: "d1",
          project_id: "p1",
          submitted_at: "2026-07-03T00:00:00Z",
          projects: { name: "Deal X" },
          deliverables: { name: "LOI" },
        },
        stakeholders: { linked_user_id: ME },
      },
      {
        // not the active stage (stage 2 while current is 1) → filtered out
        id: "stage-later",
        stage_order: 2,
        deliverable_approvals: {
          id: "a1",
          status: "pending",
          current_stage_order: 1,
          deliverable_id: "d1",
          project_id: "p1",
          submitted_at: "2026-07-03T00:00:00Z",
          projects: { name: "Deal X" },
          deliverables: { name: "LOI" },
        },
        stakeholders: { linked_user_id: ME },
      },
      {
        // approval already decided → filtered out
        id: "stage-done",
        stage_order: 1,
        deliverable_approvals: {
          id: "a2",
          status: "approved",
          current_stage_order: 1,
          deliverable_id: "d2",
          project_id: "p1",
          submitted_at: "2026-07-02T00:00:00Z",
          projects: { name: "Deal X" },
          deliverables: { name: "SPA" },
        },
        stakeholders: { linked_user_id: ME },
      },
    ]
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: rows, error: null }) })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.approvals).toHaveLength(1)
    expect(body.approvals[0].stage_id).toBe("stage-active")
    expect(body.approvals[0].deliverable_name).toBe("LOI")
  })

  it("500 on query error", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: { message: "boom" } }),
    })
    expect((await GET()).status).toBe(500)
  })
})
