import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-77-γ — skill knowledge-links list/create route tests.

const { getUserMock, resolveTenantMock, requireAdminMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  resolveTenantMock: vi.fn(),
  requireAdminMock: vi.fn(),
}))

interface Chain {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
}
let chain: Chain
function resetChain() {
  chain = {} as Chain
  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn()
  chain.maybeSingle = vi.fn()
  chain.single = vi.fn()
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => chain),
  })),
}))
vi.mock("../../../_lib/active-tenant", () => ({
  resolveActiveTenantId: resolveTenantMock,
}))
vi.mock("../../../_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, requireTenantAdmin: requireAdminMock }
})

import { GET, POST } from "./route"

const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const SID = "11111111-1111-4111-8111-111111111111"
const NODE = "44444444-4444-4444-8444-444444444444"

function ctx(id = SID) {
  return { params: Promise.resolve({ id }) }
}
function post(body: unknown, id = SID) {
  return POST(
    new Request("http://t/", { method: "POST", body: JSON.stringify(body) }),
    ctx(id)
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

describe("GET /api/skills/[id]/knowledge-links", () => {
  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await GET(new Request("http://t/"), ctx())).status).toBe(401)
  })
  it("403 when not a tenant-admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(new Response(null, { status: 403 }))
    expect((await GET(new Request("http://t/"), ctx())).status).toBe(403)
  })
  it("lists links for an admin", async () => {
    adminOk()
    chain.limit.mockResolvedValue({ data: [{ id: "l1" }], error: null })
    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(200)
    const json = (await res.json()) as { links: unknown[] }
    expect(json.links).toHaveLength(1)
  })
})

describe("POST /api/skills/[id]/knowledge-links", () => {
  it("403 when not a tenant-admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    resolveTenantMock.mockResolvedValue("t1")
    requireAdminMock.mockResolvedValue(new Response(null, { status: 403 }))
    expect((await post({ document_node_id: NODE })).status).toBe(403)
  })
  it("400 on non-uuid document_node_id", async () => {
    adminOk()
    expect((await post({ document_node_id: "nope" })).status).toBe(400)
  })
  it("400 on invalid link_mode", async () => {
    adminOk()
    expect((await post({ document_node_id: NODE, link_mode: "bogus" })).status).toBe(400)
  })
  it("201 links a node for an admin", async () => {
    adminOk()
    chain.maybeSingle.mockResolvedValueOnce({ data: { id: SID }, error: null }) // skill exists
    chain.single.mockResolvedValue({ data: { id: "l1", document_node_id: NODE }, error: null })
    const res = await post({ document_node_id: NODE, include_subtree: true, link_mode: "required" })
    expect(res.status).toBe(201)
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        skill_id: SID,
        tenant_id: "t1",
        document_node_id: NODE,
        include_subtree: true,
        link_mode: "required",
      })
    )
  })
  it("409 on duplicate link (23505)", async () => {
    adminOk()
    chain.maybeSingle.mockResolvedValueOnce({ data: { id: SID }, error: null })
    chain.single.mockResolvedValue({ data: null, error: { code: "23505", message: "dup" } })
    expect((await post({ document_node_id: NODE })).status).toBe(409)
  })
  it("422 on cross-tenant / invalid node (23514)", async () => {
    adminOk()
    chain.maybeSingle.mockResolvedValueOnce({ data: { id: SID }, error: null })
    chain.single.mockResolvedValue({ data: null, error: { code: "23514", message: "tenant mismatch" } })
    expect((await post({ document_node_id: NODE })).status).toBe(422)
  })
  it("404 when the skill is not in the tenant", async () => {
    adminOk()
    chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    expect((await post({ document_node_id: NODE })).status).toBe(404)
  })
})
