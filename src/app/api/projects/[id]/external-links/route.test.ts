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

import { DELETE, GET, POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const DELV = "dddddddd-4444-4444-8444-dddddddddddd"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

// Chainable supabase stub: from().select().eq().eq().order() resolves; insert().select().single()
function supa(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  const ret = () => chain
  chain.select = vi.fn(ret)
  chain.eq = vi.fn(ret)
  chain.order = vi.fn(async () => result)
  chain.insert = vi.fn(ret)
  chain.single = vi.fn(async () => result)
  chain.delete = vi.fn(ret)
  // terminal for delete: .eq().eq() then awaited
  chain.then = undefined
  return { from: vi.fn(() => chain), _chain: chain }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}
const OK = { entity_type: "deliverable", entity_id: DELV, url: "https://vdr.example/1", label: "L" }

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("POST .../external-links", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({ data: null, error: null }) })
    const res = await POST(new Request("http://t", { method: "POST", body: JSON.stringify(OK) }), ctx())
    expect(res.status).toBe(401)
  })

  it("400 invalid entity_type", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(new Request("http://t", { method: "POST", body: JSON.stringify({ ...OK, entity_type: "bogus" }) }), ctx())
    expect(res.status).toBe(400)
  })

  it("400 rejects a non-https url (SSRF-safe validation)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(new Request("http://t", { method: "POST", body: JSON.stringify({ ...OK, url: "http://169.254.169.254/" }) }), ctx())
    expect(res.status).toBe(400)
  })

  it("201 creates a link", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: { id: "l1", url: OK.url }, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(new Request("http://t", { method: "POST", body: JSON.stringify(OK) }), ctx())
    expect(res.status).toBe(201)
    expect((await res.json()).link.id).toBe("l1")
  })

  it("403 when RLS need-to-know denies (42501)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: { code: "42501", message: "denied" } }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(new Request("http://t", { method: "POST", body: JSON.stringify(OK) }), ctx())
    expect(res.status).toBe(403)
  })

  it("404 when the parent does not exist (23503)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: { code: "23503", message: "no parent" } }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(new Request("http://t", { method: "POST", body: JSON.stringify(OK) }), ctx())
    expect(res.status).toBe(404)
  })
})

describe("GET .../external-links", () => {
  it("400 without entity_type/entity_id", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: [], error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await GET(new Request("http://t/api/projects/x/external-links"), ctx())
    expect(res.status).toBe(400)
  })

  it("200 lists links for an entity", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: [{ id: "l1" }], error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await GET(
      new Request(`http://t/api/projects/x/external-links?entity_type=deliverable&entity_id=${DELV}`),
      ctx()
    )
    expect(res.status).toBe(200)
    expect((await res.json()).links).toHaveLength(1)
  })
})

describe("DELETE .../external-links", () => {
  it("400 without link_id", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await DELETE(new Request("http://t/api/projects/x/external-links"), ctx())
    expect(res.status).toBe(400)
  })
})
