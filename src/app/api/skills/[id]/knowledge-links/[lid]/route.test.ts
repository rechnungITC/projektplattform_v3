import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-77-γ — single knowledge-link PATCH/DELETE route tests.

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
const LID = "55555555-5555-4555-8555-555555555555"

function ctx(id = SID, lid = LID) {
  return { params: Promise.resolve({ id, lid }) }
}
function patch(body: unknown, id = SID, lid = LID) {
  return PATCH(
    new Request("http://t/", { method: "PATCH", body: JSON.stringify(body) }),
    ctx(id, lid)
  )
}
function adminOk() {
  getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
  resolveTenantMock.mockResolvedValue("t1")
  requireAdminMock.mockResolvedValue(null)
}

beforeEach(() => {
  resetChain()
  getUserMock.mockReset()
  resolveTenantMock.mockReset()
  requireAdminMock.mockReset()
})

describe("PATCH /api/skills/[id]/knowledge-links/[lid]", () => {
  it("400 on non-uuid link id", async () => {
    expect((await patch({ include_subtree: true }, SID, "nope")).status).toBe(400)
  })
  it("403 when not a tenant-admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(new Response(null, { status: 403 }))
    expect((await patch({ include_subtree: true })).status).toBe(403)
  })
  it("400 on empty body", async () => {
    adminOk()
    expect((await patch({})).status).toBe(400)
  })
  it("400 on invalid link_mode", async () => {
    adminOk()
    expect((await patch({ link_mode: "bogus" })).status).toBe(400)
  })
  it("404 when the link is not found", async () => {
    adminOk()
    chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    expect((await patch({ include_subtree: false })).status).toBe(404)
  })
  it("200 updates a link for an admin", async () => {
    adminOk()
    chain.maybeSingle.mockResolvedValueOnce({ data: { id: LID, include_subtree: true }, error: null })
    const res = await patch({ include_subtree: true, link_mode: "required" })
    expect(res.status).toBe(200)
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ include_subtree: true, link_mode: "required" })
    )
  })
})

describe("DELETE /api/skills/[id]/knowledge-links/[lid]", () => {
  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(new Request("http://t/", { method: "DELETE" }), ctx())
    expect(res.status).toBe(401)
  })
  it("200 deletes for an admin", async () => {
    adminOk()
    chain.eq.mockReturnValueOnce(chain).mockReturnValueOnce(chain).mockResolvedValueOnce({ error: null })
    const res = await DELETE(new Request("http://t/", { method: "DELETE" }), ctx())
    expect(res.status).toBe(200)
    expect(chain.delete).toHaveBeenCalled()
  })
})
