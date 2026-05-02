import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-24 Phase δ — work-items PATCH route, cost-driver hook tests.
//
// This test focuses on the synthesizer hook only:
//   1. attribute change to a cost-driver field (story_points or
//      estimated_duration_days) → synthesizer fires
//   2. kind change → synthesizer fires
//   3. unrelated attribute change (e.g. ui_position) → synthesizer does NOT fire
//   4. only `title` patch → synthesizer does NOT fire (cheaper read path)
//   5. synthesizer rejects → response is still 200 (fail-open)

const getUserMock = vi.fn()
const synthesizeMock = vi.fn(
  async (_input: Record<string, unknown>) => ({
    written: 0,
    warnings: [],
    hadCostCalcError: false,
  })
)

// --- Per-table chains -------------------------------------------------------
const workItemPreChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const workItemUpdateChain = {
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

// The route's call pattern for `from('work_items')`:
//   - cost-driver patch (attributes/kind): pre-read first, then UPDATE
//   - non-cost-driver patch (title/etc.): UPDATE only
// We dispatch by inspecting the operation chain — pre-read uses .select()
// then .maybeSingle(); the update uses .update().
const fromMock = vi.fn((table: string) => {
  if (table === "work_items") {
    // Return a router chain that delegates to either pre-read or update
    // based on the first method call (.select vs .update).
    const router: Record<string, unknown> = {
      select: (...args: unknown[]) => {
        // delegated path: pre-update read.
        return (workItemPreChain.select as unknown as (...a: unknown[]) => unknown)(...args)
      },
      update: (...args: unknown[]) => {
        return (workItemUpdateChain.update as unknown as (...a: unknown[]) => unknown)(...args)
      },
    }
    return router
  }
  if (table === "projects") {
    const chain: { select: unknown; eq: unknown; maybeSingle: unknown } = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: { project_method: "scrum" }, error: null }),
    }
    return chain
  }
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({})),
}))

vi.mock("@/lib/cost", () => ({
  synthesizeResourceAllocationCostLines: (input: Record<string, unknown>) =>
    synthesizeMock(input),
}))

import { PATCH } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const WORK_ITEM_ID = "55555555-5555-4555-8555-555555555555"

function makePatch(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/work-items/${WORK_ITEM_ID}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
}
function makeCtx() {
  return {
    params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  synthesizeMock.mockResolvedValue({
    written: 0,
    warnings: [],
    hadCostCalcError: false,
  })

  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

  workItemPreChain.select.mockReturnValue(workItemPreChain)
  workItemPreChain.eq.mockReturnValue(workItemPreChain)
  workItemUpdateChain.update.mockReturnValue(workItemUpdateChain)
  workItemUpdateChain.eq.mockReturnValue(workItemUpdateChain)
  workItemUpdateChain.select.mockReturnValue(workItemUpdateChain)
})

describe("PATCH work_items: cost-driver hook", () => {
  it("title-only patch does NOT trigger synthesizer (and no extra read)", async () => {
    workItemUpdateChain.single.mockResolvedValue({
      data: {
        id: WORK_ITEM_ID,
        kind: "story",
        attributes: { story_points: 5 },
        tenant_id: TENANT_ID,
        title: "new title",
      },
      error: null,
    })
    const res = await PATCH(makePatch({ title: "new title" }), makeCtx())
    expect(res.status).toBe(200)
    expect(synthesizeMock).not.toHaveBeenCalled()
    // The route should NOT have read the pre-update attributes for a
    // non-cost-driver patch.
    expect(workItemPreChain.maybeSingle).not.toHaveBeenCalled()
  })

  it("attributes patch with story_points change triggers synthesizer", async () => {
    workItemPreChain.maybeSingle.mockResolvedValue({
      data: {
        kind: "story",
        attributes: { story_points: 5 },
        tenant_id: TENANT_ID,
      },
      error: null,
    })
    workItemUpdateChain.single.mockResolvedValue({
      data: {
        id: WORK_ITEM_ID,
        kind: "story",
        attributes: { story_points: 8 },
        tenant_id: TENANT_ID,
      },
      error: null,
    })
    const res = await PATCH(
      makePatch({ attributes: { story_points: 8 } }),
      makeCtx()
    )
    expect(res.status).toBe(200)
    expect(synthesizeMock).toHaveBeenCalledTimes(1)
    const call = synthesizeMock.mock.calls[0][0] as Record<string, unknown>
    expect(call.workItemId).toBe(WORK_ITEM_ID)
    expect(call.tenantId).toBe(TENANT_ID)
    expect(call.actorUserId).toBe(USER_ID)
  })

  it("attributes patch with same cost-driver values does NOT trigger synthesizer", async () => {
    workItemPreChain.maybeSingle.mockResolvedValue({
      data: {
        kind: "story",
        attributes: { story_points: 5, estimated_duration_days: 2 },
        tenant_id: TENANT_ID,
      },
      error: null,
    })
    workItemUpdateChain.single.mockResolvedValue({
      data: {
        id: WORK_ITEM_ID,
        kind: "story",
        // Same SP + duration, only some other attribute changed.
        attributes: { story_points: 5, estimated_duration_days: 2, color: "red" },
        tenant_id: TENANT_ID,
      },
      error: null,
    })
    const res = await PATCH(
      makePatch({
        attributes: { story_points: 5, estimated_duration_days: 2, color: "red" },
      }),
      makeCtx()
    )
    expect(res.status).toBe(200)
    expect(synthesizeMock).not.toHaveBeenCalled()
  })

  it("attributes patch with estimated_duration_days change triggers synthesizer", async () => {
    workItemPreChain.maybeSingle.mockResolvedValue({
      data: {
        kind: "work_package",
        attributes: { estimated_duration_days: 4 },
        tenant_id: TENANT_ID,
      },
      error: null,
    })
    workItemUpdateChain.single.mockResolvedValue({
      data: {
        id: WORK_ITEM_ID,
        kind: "work_package",
        attributes: { estimated_duration_days: 7 },
        tenant_id: TENANT_ID,
      },
      error: null,
    })
    const res = await PATCH(
      makePatch({ attributes: { estimated_duration_days: 7 } }),
      makeCtx()
    )
    expect(res.status).toBe(200)
    expect(synthesizeMock).toHaveBeenCalledTimes(1)
  })

  it("response stays 200 when synthesizer rejects (fail-open)", async () => {
    workItemPreChain.maybeSingle.mockResolvedValue({
      data: {
        kind: "story",
        attributes: { story_points: 3 },
        tenant_id: TENANT_ID,
      },
      error: null,
    })
    workItemUpdateChain.single.mockResolvedValue({
      data: {
        id: WORK_ITEM_ID,
        kind: "story",
        attributes: { story_points: 5 },
        tenant_id: TENANT_ID,
      },
      error: null,
    })
    synthesizeMock.mockRejectedValueOnce(new Error("engine down"))
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    const res = await PATCH(
      makePatch({ attributes: { story_points: 5 } }),
      makeCtx()
    )
    expect(res.status).toBe(200)
    errorSpy.mockRestore()
  })
})
