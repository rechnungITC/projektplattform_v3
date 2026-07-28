import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-77-β — single skill example PATCH/DELETE route tests.

const { getUserMock, resolveTenantMock, requireAdminMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  resolveTenantMock: vi.fn(),
  requireAdminMock: vi.fn(),
}))

interface Chain {
  select: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}
let chain: Chain
function resetChain() {
  chain = {} as Chain
  chain.select = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.maybeSingle = vi.fn()
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => chain),
  })),
}))
vi.mock("../../../../_lib/active-tenant", () => ({
  resolveActiveTenantId: resolveTenantMock,
}))
vi.mock("../../../../_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, requireTenantAdmin: requireAdminMock }
})

import { DELETE, PATCH } from "./route"

const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const SID = "11111111-1111-4111-8111-111111111111"
const EID = "22222222-2222-4222-8222-222222222222"

function ctx(id = SID, eid = EID) {
  return { params: Promise.resolve({ id, eid }) }
}
function patch(body: unknown, id = SID, eid = EID) {
  return PATCH(
    new Request("http://t/", { method: "PATCH", body: JSON.stringify(body) }),
    ctx(id, eid)
  )
}

beforeEach(() => {
  resetChain()
  getUserMock.mockReset()
  resolveTenantMock.mockReset()
  requireAdminMock.mockReset()
})

describe("PATCH /api/skills/[id]/examples/[eid]", () => {
  it("400 on non-uuid example id", async () => {
    expect((await patch({ title: "x" }, SID, "nope")).status).toBe(400)
  })
  it("403 when not a tenant-admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(new Response(null, { status: 403 }))
    expect((await patch({ title: "x" })).status).toBe(403)
  })
  it("400 on empty body", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    expect((await patch({})).status).toBe(400)
  })
  it("400 on empty input", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    expect((await patch({ input: "" })).status).toBe(400)
  })
  it("404 when the example is not found", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    expect((await patch({ title: "New" })).status).toBe(404)
  })
  it("200 updates an example for an admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.maybeSingle.mockResolvedValueOnce({ data: { id: EID, title: "New" }, error: null })
    const res = await patch({ title: "New", display_order: 5 })
    expect(res.status).toBe(200)
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: "New", display_order: 5 })
    )
  })
})

describe("DELETE /api/skills/[id]/examples/[eid]", () => {
  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(new Request("http://t/", { method: "DELETE" }), ctx())
    expect(res.status).toBe(401)
  })
  it("200 deletes for an admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.eq.mockReturnValueOnce(chain).mockReturnValueOnce(chain).mockResolvedValueOnce({ error: null })
    const res = await DELETE(new Request("http://t/", { method: "DELETE" }), ctx())
    expect(res.status).toBe(200)
    expect(chain.delete).toHaveBeenCalled()
  })
})
