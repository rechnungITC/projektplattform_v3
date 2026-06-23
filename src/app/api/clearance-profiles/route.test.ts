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
vi.mock("../_lib/active-tenant", () => ({
  resolveActiveTenantId: resolveTenantMock,
}))
vi.mock("../_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, requireTenantAdmin: requireAdminMock }
})

import { GET, POST } from "./route"

const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function post(body: unknown) {
  return POST(
    new Request("http://t/", { method: "POST", body: JSON.stringify(body) })
  )
}

beforeEach(() => {
  resetChain()
  getUserMock.mockReset()
  resolveTenantMock.mockReset()
  requireAdminMock.mockReset()
})

describe("GET /api/clearance-profiles", () => {
  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await GET()).status).toBe(401)
  })

  it("lists tenant profiles", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    chain.limit.mockResolvedValue({
      data: [{ id: "p1", name: "DD Legal", granted_level: "confidential" }],
      error: null,
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const json = (await res.json()) as { profiles: unknown[] }
    expect(json.profiles).toHaveLength(1)
  })
})

describe("POST /api/clearance-profiles", () => {
  it("403 when not a tenant-admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(
      new Response(null, { status: 403 })
    )
    expect((await post({ name: "X", granted_level: "confidential" })).status).toBe(403)
  })

  it("400 on invalid level 'standard'", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    expect((await post({ name: "X", granted_level: "standard" })).status).toBe(400)
  })

  it("201 creates a profile for an admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.single.mockResolvedValue({
      data: { id: "p1", name: "DD Legal", granted_level: "confidential" },
      error: null,
    })
    const res = await post({ name: "DD Legal", granted_level: "confidential" })
    expect(res.status).toBe(201)
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "t1",
        name: "DD Legal",
        granted_level: "confidential",
        created_by: ME,
      })
    )
  })

  it("409 on duplicate name (23505)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.single.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate" },
    })
    expect((await post({ name: "Dup", granted_level: "strict" })).status).toBe(409)
  })
})
