import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthMock, accessMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  accessMock: vi.fn(),
}))

vi.mock("@/app/api/_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    getAuthenticatedUserId: getAuthMock,
    requireProjectAccess: accessMock,
  }
})

import { GET, POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const WS = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "eq", "order", "insert"]) c[m] = vi.fn(() => c)
  for (const t of ["limit", "single", "maybeSingle"]) c[t] = vi.fn(async () => result)
  return c
}
function supa(result: { data: unknown; error: unknown }) {
  return { from: vi.fn(() => chain(result)) }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}
function postReq(body: unknown) {
  return new Request("http://t/deliverables", { method: "POST", body: JSON.stringify(body) })
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("GET /api/projects/[id]/deliverables", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({ data: [], error: null }) })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(401)
  })
  it("lists (200)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: [{ id: "d1", status: "planned" }], error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await GET(new Request("http://t"), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).deliverables).toHaveLength(1)
  })
  it("forwards access error (403)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: [], error: null }) })
    accessMock.mockResolvedValue({ error: Response.json({ error: {} }, { status: 403 }) })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(403)
  })
})

describe("POST /api/projects/[id]/deliverables", () => {
  it("400 missing name", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(postReq({ workstream_id: WS }), ctx())).status).toBe(400)
  })
  it("400 no anchor (neither phase nor workstream)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(postReq({ name: "LOI" }), ctx())).status).toBe(400)
  })
  it("creates (201) with workstream anchor", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: { id: "new", status: "planned" }, error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(postReq({ name: "LOI", workstream_id: WS }), ctx())
    expect(res.status).toBe(201)
    expect((await res.json()).deliverable.id).toBe("new")
  })
  it("422 on anchor CHECK violation from DB", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: { code: "23514", message: "check" } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(postReq({ name: "X", phase_id: WS }), ctx())).status).toBe(422)
  })
})
