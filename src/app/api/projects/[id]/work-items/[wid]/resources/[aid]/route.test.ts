import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-11 — single-allocation endpoint tests.
// PROJ-24 Phase δ — extended with cost-line synthesizer hook tests for
// PATCH (allocation update) and DELETE (allocation removal).

const getUserMock = vi.fn()
const synthesizeMock = vi.fn(
  async (_input: Record<string, unknown>) => ({
    written: 0,
    warnings: [],
    hadCostCalcError: false,
  })
)

const projectChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const tenantMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const projectMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const updateChain = {
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
  __deleteResult: { error: null as { code?: string; message: string } | null },
  then: (resolve: (v: unknown) => void) => resolve(updateChain.__deleteResult),
}

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "project_memberships") return projectMembershipChain
  if (table === "work_item_resources") return updateChain
  if (table === "tenant_settings") {
    const chain: { select: unknown; eq: unknown; maybeSingle: unknown } = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
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

import { DELETE, PATCH } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const WORK_ITEM_ID = "55555555-5555-4555-8555-555555555555"
const ALLOCATION_ID = "44444444-4444-4444-8444-444444444444"

function makeCtx() {
  return {
    params: Promise.resolve({
      id: PROJECT_ID,
      wid: WORK_ITEM_ID,
      aid: ALLOCATION_ID,
    }),
  }
}
function makePatch(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/work-items/${WORK_ITEM_ID}/resources/${ALLOCATION_ID}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
}
function makeDelete(): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/work-items/${WORK_ITEM_ID}/resources/${ALLOCATION_ID}`,
    { method: "DELETE" }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  synthesizeMock.mockResolvedValue({
    written: 0,
    warnings: [],
    hadCostCalcError: false,
  })

  projectChain.select.mockReturnValue(projectChain)
  projectChain.eq.mockReturnValue(projectChain)
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  projectMembershipChain.select.mockReturnValue(projectMembershipChain)
  projectMembershipChain.eq.mockReturnValue(projectMembershipChain)

  updateChain.update.mockReturnValue(updateChain)
  updateChain.delete.mockReturnValue(updateChain)
  updateChain.eq.mockReturnValue(updateChain)
  updateChain.select.mockReturnValue(updateChain)
  updateChain.__deleteResult = { error: null }

  projectChain.maybeSingle.mockResolvedValue({
    data: { id: PROJECT_ID, tenant_id: TENANT_ID },
    error: null,
  })
  tenantMembershipChain.maybeSingle.mockResolvedValue({
    data: { role: "admin" },
    error: null,
  })
  projectMembershipChain.maybeSingle.mockResolvedValue({
    data: null,
    error: null,
  })
})

describe("PATCH /api/projects/[id]/work-items/[wid]/resources/[aid]", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makePatch({ allocation_pct: 30 }), makeCtx())
    expect(res.status).toBe(401)
    expect(synthesizeMock).not.toHaveBeenCalled()
  })

  it("returns 200 + triggers synthesizer on successful update", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    updateChain.single.mockResolvedValue({
      data: {
        id: ALLOCATION_ID,
        tenant_id: TENANT_ID,
        project_id: PROJECT_ID,
        work_item_id: WORK_ITEM_ID,
        allocation_pct: 30,
      },
      error: null,
    })
    const res = await PATCH(makePatch({ allocation_pct: 30 }), makeCtx())
    expect(res.status).toBe(200)
    expect(synthesizeMock).toHaveBeenCalledTimes(1)
    const call = synthesizeMock.mock.calls[0][0] as Record<string, unknown>
    expect(call.workItemId).toBe(WORK_ITEM_ID)
    expect(call.actorUserId).toBe(USER_ID)
  })

  it("does NOT trigger synthesizer when update fails (404)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    updateChain.single.mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "not found" },
    })
    const res = await PATCH(makePatch({ allocation_pct: 30 }), makeCtx())
    expect(res.status).toBe(404)
    expect(synthesizeMock).not.toHaveBeenCalled()
  })

  it("returns 200 even when synthesizer rejects (fail-open)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    updateChain.single.mockResolvedValue({
      data: {
        id: ALLOCATION_ID,
        tenant_id: TENANT_ID,
        project_id: PROJECT_ID,
        work_item_id: WORK_ITEM_ID,
        allocation_pct: 30,
      },
      error: null,
    })
    synthesizeMock.mockRejectedValueOnce(new Error("engine error"))
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    const res = await PATCH(makePatch({ allocation_pct: 30 }), makeCtx())
    expect(res.status).toBe(200)
    errorSpy.mockRestore()
  })

  it("rejects PATCH with no fields (400)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PATCH(makePatch({}), makeCtx())
    expect(res.status).toBe(400)
    expect(synthesizeMock).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/projects/[id]/work-items/[wid]/resources/[aid]", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeDelete(), makeCtx())
    expect(res.status).toBe(401)
    expect(synthesizeMock).not.toHaveBeenCalled()
  })

  it("returns 204 + triggers synthesizer on successful delete", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    updateChain.__deleteResult = { error: null }
    const res = await DELETE(makeDelete(), makeCtx())
    expect(res.status).toBe(204)
    expect(synthesizeMock).toHaveBeenCalledTimes(1)
    const call = synthesizeMock.mock.calls[0][0] as Record<string, unknown>
    expect(call.workItemId).toBe(WORK_ITEM_ID)
  })

  it("does NOT trigger synthesizer when delete fails (403)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    updateChain.__deleteResult = { error: { code: "42501", message: "denied" } }
    const res = await DELETE(makeDelete(), makeCtx())
    expect(res.status).toBe(403)
    expect(synthesizeMock).not.toHaveBeenCalled()
  })

  it("returns 204 even when synthesizer rejects (fail-open)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    updateChain.__deleteResult = { error: null }
    synthesizeMock.mockRejectedValueOnce(new Error("engine error"))
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    const res = await DELETE(makeDelete(), makeCtx())
    expect(res.status).toBe(204)
    errorSpy.mockRestore()
  })
})
