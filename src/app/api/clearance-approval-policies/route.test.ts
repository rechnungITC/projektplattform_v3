import { beforeEach, describe, expect, it, vi } from "vitest"

const { getUserMock, resolveTenantMock, requireAdminMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  resolveTenantMock: vi.fn(),
  requireAdminMock: vi.fn(),
}))

interface Chain {
  upsert: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
}
let chain: Chain
function resetChain() {
  chain = {} as Chain
  chain.upsert = vi.fn().mockReturnValue(chain)
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

import { GET, PUT } from "./route"

const ME = "cccccccc-3333-4333-8333-cccccccccccc"
function put(body: unknown) {
  return PUT(new Request("http://t/", { method: "PUT", body: JSON.stringify(body) }))
}

beforeEach(() => {
  resetChain()
  getUserMock.mockReset()
  resolveTenantMock.mockReset()
  requireAdminMock.mockReset()
})

describe("GET /api/clearance-approval-policies", () => {
  it("401 unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await GET()).status).toBe(401)
  })
  it("lists policies", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    chain.limit.mockResolvedValue({ data: [{ id: "x", level: "strict", enabled: true }], error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(((await res.json()) as { policies: unknown[] }).policies).toHaveLength(1)
  })
})

describe("PUT /api/clearance-approval-policies", () => {
  it("403 when not a tenant-admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(new Response(null, { status: 403 }))
    expect((await put({ level: "strict", enabled: true, persons_required: 1 })).status).toBe(403)
  })
  it("400 on invalid level 'standard'", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    expect((await put({ level: "standard", enabled: true, persons_required: 1 })).status).toBe(400)
  })
  it("400 on persons_required out of range", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    expect((await put({ level: "strict", enabled: true, persons_required: 0 })).status).toBe(400)
  })
  it("200 upserts for an admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.single.mockResolvedValue({ data: { id: "x", level: "strict", enabled: true, persons_required: 2 }, error: null })
    const res = await put({ level: "strict", enabled: true, persons_required: 2 })
    expect(res.status).toBe(200)
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: "t1", level: "strict", enabled: true, persons_required: 2 }),
      expect.objectContaining({ onConflict: "tenant_id,level" })
    )
  })
})
