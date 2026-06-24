import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthMock, resolveTenantMock, adminMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  resolveTenantMock: vi.fn(),
  adminMock: vi.fn(),
}))

vi.mock("../_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    getAuthenticatedUserId: getAuthMock,
    requireTenantAdmin: adminMock,
  }
})
vi.mock("../_lib/active-tenant", () => ({ resolveActiveTenantId: resolveTenantMock }))

import { GET, POST } from "./route"

const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const TENANT = "11111111-1111-4111-8111-111111111111"

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "eq", "order", "insert", "update", "delete"]) {
    c[m] = vi.fn(() => c)
  }
  for (const t of ["limit", "single", "maybeSingle"]) {
    c[t] = vi.fn(async () => result)
  }
  return c
}
function supa(result: { data: unknown; error: unknown }, rpcResult: { error: unknown } = { error: null }) {
  return { from: vi.fn(() => chain(result)), rpc: vi.fn(async () => rpcResult) }
}
function postReq(body: unknown) {
  return new Request("http://t/dd-stream-templates", { method: "POST", body: JSON.stringify(body) })
}

beforeEach(() => {
  getAuthMock.mockReset()
  resolveTenantMock.mockReset()
  adminMock.mockReset()
})

describe("GET /api/dd-stream-templates", () => {
  it("401 when unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({ data: [], error: null }) })
    expect((await GET()).status).toBe(401)
  })

  it("403 with no tenant membership", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: [], error: null }) })
    resolveTenantMock.mockResolvedValue(null)
    expect((await GET()).status).toBe(403)
  })

  it("lazily seeds then lists templates", async () => {
    const supabase = supa({ data: [{ id: "t", stream_key: "legal" }], error: null })
    getAuthMock.mockResolvedValue({ userId: ME, supabase })
    resolveTenantMock.mockResolvedValue(TENANT)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(supabase.rpc).toHaveBeenCalledWith("ensure_default_dd_stream_templates", {
      p_tenant_id: TENANT,
    })
    expect((await res.json()).templates).toHaveLength(1)
  })
})

describe("POST /api/dd-stream-templates", () => {
  it("403 when not tenant admin", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    resolveTenantMock.mockResolvedValue(TENANT)
    adminMock.mockResolvedValue(Response.json({ error: {} }, { status: 403 }))
    expect((await POST(postReq({ stream_key: "esg", label: "ESG" }))).status).toBe(403)
  })

  it("400 on invalid stream_key", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    resolveTenantMock.mockResolvedValue(TENANT)
    adminMock.mockResolvedValue(null)
    expect((await POST(postReq({ stream_key: "ESG!", label: "ESG" }))).status).toBe(400)
  })

  it("creates a template (201)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: { id: "new", stream_key: "esg" }, error: null }),
    })
    resolveTenantMock.mockResolvedValue(TENANT)
    adminMock.mockResolvedValue(null)
    const res = await POST(postReq({ stream_key: "esg", label: "ESG" }))
    expect(res.status).toBe(201)
    expect((await res.json()).template.id).toBe("new")
  })

  it("409 on duplicate key", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: { code: "23505", message: "dup" } }),
    })
    resolveTenantMock.mockResolvedValue(TENANT)
    adminMock.mockResolvedValue(null)
    expect((await POST(postReq({ stream_key: "legal", label: "Legal" }))).status).toBe(409)
  })
})
