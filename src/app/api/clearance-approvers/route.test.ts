import { beforeEach, describe, expect, it, vi } from "vitest"

const { getUserMock, resolveTenantMock, requireAdminMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  resolveTenantMock: vi.fn(),
  requireAdminMock: vi.fn(),
}))

interface Chain {
  insert: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
}
let chain: Chain
function resetChain() {
  chain = {} as Chain
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn()
  chain.single = vi.fn()
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => chain),
  })),
}))
vi.mock("../_lib/active-tenant", () => ({ resolveActiveTenantId: resolveTenantMock }))
vi.mock("../_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, requireTenantAdmin: requireAdminMock }
})

import { GET, POST } from "./route"

const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const APPROVER = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"
function post(body: unknown) {
  return POST(new Request("http://t/", { method: "POST", body: JSON.stringify(body) }))
}

beforeEach(() => {
  resetChain()
  getUserMock.mockReset()
  resolveTenantMock.mockReset()
  requireAdminMock.mockReset()
})

describe("GET /api/clearance-approvers", () => {
  it("401 unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await GET()).status).toBe(401)
  })
  it("lists approvers", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    chain.limit.mockResolvedValue({ data: [{ id: "a1", approver_user_id: APPROVER }], error: null })
    expect((await GET()).status).toBe(200)
  })
})

describe("POST /api/clearance-approvers", () => {
  it("403 when not a tenant-admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(new Response(null, { status: 403 }))
    expect((await post({ approver_user_id: APPROVER })).status).toBe(403)
  })
  it("400 on missing approver_user_id", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    expect((await post({ level: "strict" })).status).toBe(400)
  })
  it("201 adds an approver", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.single.mockResolvedValue({ data: { id: "a1", approver_user_id: APPROVER }, error: null })
    const res = await post({ approver_user_id: APPROVER, level: "strict" })
    expect(res.status).toBe(201)
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: "t1", approver_user_id: APPROVER, level: "strict", created_by: ME })
    )
  })
  it("409 on duplicate (23505)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.single.mockResolvedValue({ data: null, error: { code: "23505", message: "dup" } })
    expect((await post({ approver_user_id: APPROVER })).status).toBe(409)
  })
})
