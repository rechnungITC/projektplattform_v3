import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-107 — tenant risk-category catalog route tests.

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

describe("GET /api/risk-categories", () => {
  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await GET()).status).toBe(401)
  })

  it("lists tenant categories", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    chain.limit.mockResolvedValue({
      data: [{ id: "c1", key: "legal", label: "Legal", is_active: true }],
      error: null,
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const json = (await res.json()) as { categories: unknown[] }
    expect(json.categories).toHaveLength(1)
  })
})

describe("POST /api/risk-categories", () => {
  it("403 when not a tenant-admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(new Response(null, { status: 403 }))
    expect((await post({ key: "legal", label: "Legal" })).status).toBe(403)
  })

  it("400 on invalid key (uppercase/space)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    expect((await post({ key: "Legal Risk", label: "Legal" })).status).toBe(400)
  })

  it("400 when label missing", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    expect((await post({ key: "legal" })).status).toBe(400)
  })

  it("201 creates a category for an admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.single.mockResolvedValue({
      data: { id: "c1", key: "legal", label: "Legal" },
      error: null,
    })
    const res = await post({ key: "legal", label: "Legal", sort_order: 30 })
    expect(res.status).toBe(201)
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "t1",
        key: "legal",
        label: "Legal",
        applies_to_project_type: null,
        sort_order: 30,
        is_active: true,
        created_by: ME,
      })
    )
  })

  it("409 on duplicate key (23505)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(null)
    chain.single.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate" },
    })
    expect((await post({ key: "legal", label: "Legal" })).status).toBe(409)
  })

  it("403 when no active tenant", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue(null)
    expect((await post({ key: "legal", label: "Legal" })).status).toBe(403)
  })
})
