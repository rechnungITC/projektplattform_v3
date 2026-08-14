import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-45-α — tenant-wide trade catalog route tests.
// Mirrors the PROJ-107 risk-category test harness: the Supabase client is a
// chainable mock, auth/tenant/admin helpers are stubbed, so the assertions are
// about THIS route's gating and validation, not about the database.

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
const rpcMock = vi.fn()

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
    rpc: rpcMock,
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
const TENANT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"

function post(body: unknown, search = "") {
  return POST(
    new Request(`http://t/${search}`, {
      method: "POST",
      body: JSON.stringify(body),
    })
  )
}

beforeEach(() => {
  resetChain()
  rpcMock.mockReset()
  getUserMock.mockReset()
  resolveTenantMock.mockReset()
  requireAdminMock.mockReset()
  getUserMock.mockResolvedValue({ data: { user: { id: ME } }, error: null })
  resolveTenantMock.mockResolvedValue(TENANT)
  requireAdminMock.mockResolvedValue(null)
})

describe("GET /api/construction-trades", () => {
  it("refuses an unauthenticated caller", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("lists trades for a signed-in member", async () => {
    chain.limit.mockResolvedValue({
      data: [{ id: "t1", key: "elektro", label: "Elektrotechnik" }],
      error: null,
    })
    const res = await GET()
    expect(res.status).toBe(200)
    expect((await res.json()).trades).toHaveLength(1)
  })

  it("includes inactive entries so the admin UI can reactivate them", async () => {
    chain.limit.mockResolvedValue({ data: [], error: null })
    await GET()
    // The route must NOT filter on is_active — it only orders by it.
    expect(chain.order).toHaveBeenCalledWith("is_active", { ascending: false })
  })
})

describe("POST /api/construction-trades", () => {
  it("refuses an unauthenticated caller", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })
    expect((await post({ key: "elektro", label: "Elektro" })).status).toBe(401)
  })

  it("refuses a caller without a tenant", async () => {
    resolveTenantMock.mockResolvedValue(null)
    expect((await post({ key: "elektro", label: "Elektro" })).status).toBe(403)
  })

  it("refuses a non-admin (AC-45.2 is enforced server-side)", async () => {
    const denial = new Response(JSON.stringify({ error: { code: "forbidden" } }), {
      status: 403,
    })
    requireAdminMock.mockResolvedValue(denial)
    expect((await post({ key: "elektro", label: "Elektro" })).status).toBe(403)
  })

  it("rejects a key that is not lower_snake_case", async () => {
    const res = await post({ key: "Elektro Technik", label: "Elektro" })
    expect(res.status).toBe(422)
  })

  it("rejects an empty label", async () => {
    expect((await post({ key: "elektro", label: "" })).status).toBe(422)
  })

  it("creates a trade and stamps tenant and author", async () => {
    chain.single.mockResolvedValue({ data: { id: "t1", key: "elektro" }, error: null })
    const res = await post({ key: "elektro", label: "Elektrotechnik" })
    expect(res.status).toBe(201)
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ key: "elektro", tenant_id: TENANT, created_by: ME })
    )
  })

  it("turns a duplicate key into 409 rather than a 500", async () => {
    chain.single.mockResolvedValue({ data: null, error: { code: "23505", message: "dup" } })
    expect((await post({ key: "elektro", label: "Elektro" })).status).toBe(409)
  })

  it("seeds the default catalog through the RPC, not through inserts", async () => {
    rpcMock.mockResolvedValue({ data: 18, error: null })
    const res = await post({}, "?seed=1")
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ seeded: 18 })
    expect(rpcMock).toHaveBeenCalledWith("seed_construction_trades_if_empty", {
      p_tenant_id: TENANT,
    })
    expect(chain.insert).not.toHaveBeenCalled()
  })

  it("still requires admin for the seed path", async () => {
    requireAdminMock.mockResolvedValue(
      new Response(JSON.stringify({ error: {} }), { status: 403 })
    )
    expect((await post({}, "?seed=1")).status).toBe(403)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
