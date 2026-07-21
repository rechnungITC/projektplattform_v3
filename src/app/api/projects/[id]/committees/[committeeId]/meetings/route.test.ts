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
const C = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
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
const ctx = () => ({ params: Promise.resolve({ id: P, committeeId: C }) })
const post = (b: unknown) => new Request("http://t", { method: "POST", body: JSON.stringify(b) })

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
  accessMock.mockResolvedValue({ project: { id: P, tenant_id: "t1" } })
})

describe("GET .../meetings", () => {
  it("401 unauth", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({}) })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(401)
  })
  it("200 lists", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ list: { data: [{ id: "m1" }], error: null } }) })
    const res = await GET(new Request("http://t"), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).meetings).toHaveLength(1)
  })
})

describe("POST .../meetings", () => {
  it("400 on missing title", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({}) })
    expect((await POST(post({ scheduled_at: "2026-07-21T10:00:00Z" }), ctx())).status).toBe(400)
  })
  it("201 creates", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ rpc: { data: { id: "m1", title: "Kickoff" }, error: null } }) })
    const res = await POST(post({ title: "Kickoff", scheduled_at: "2026-07-21T10:00:00Z" }), ctx())
    expect(res.status).toBe(201)
    expect((await res.json()).meeting.id).toBe("m1")
  })
  it("403 when RPC denies (42501)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ rpc: { data: null, error: { code: "42501", message: "no" } } }) })
    expect((await POST(post({ title: "X", scheduled_at: "2026-07-21T10:00:00Z" }), ctx())).status).toBe(403)
  })
})
