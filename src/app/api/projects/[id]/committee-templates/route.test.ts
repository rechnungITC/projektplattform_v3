import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthMock, accessMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  accessMock: vi.fn(),
}))
vi.mock("@/app/api/_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, getAuthenticatedUserId: getAuthMock, requireProjectAccess: accessMock }
})

import { GET, POST } from "./route"

const P = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "eq", "order", "limit"]) c[m] = vi.fn(() => c)
  ;(c as { then: unknown }).then = (r: (v: unknown) => void) => r(result)
  return c
}
function supa(opts: { list?: { data: unknown; error: unknown }; rpc?: { data: unknown; error: unknown } }) {
  return {
    from: vi.fn(() => chain(opts.list ?? { data: [], error: null })),
    rpc: vi.fn(async () => opts.rpc ?? { data: null, error: null }),
  }
}
const ctx = () => ({ params: Promise.resolve({ id: P }) })
const post = (b: unknown) => new Request("http://t", { method: "POST", body: JSON.stringify(b) })

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
  accessMock.mockResolvedValue({ project: { id: P, tenant_id: "t1" } })
})

describe("committee-templates", () => {
  it("GET 200 lists", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ list: { data: [{ id: "t" }], error: null } }) })
    const res = await GET(new Request("http://t"), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).templates).toHaveLength(1)
  })
  it("POST 201 creates", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ rpc: { data: { id: "t", name: "X" }, error: null } }) })
    const res = await POST(post({ template_key: "x", name: "X" }), ctx())
    expect(res.status).toBe(201)
  })
  it("POST 403 when non-admin (42501)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ rpc: { data: null, error: { code: "42501", message: "no" } } }) })
    expect((await POST(post({ template_key: "x", name: "X" }), ctx())).status).toBe(403)
  })
})
