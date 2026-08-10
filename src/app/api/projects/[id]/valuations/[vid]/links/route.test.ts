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
const VID = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const FINDING = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"
const LINK = "ffffffff-6666-4666-8666-ffffffffffff"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function supa(opts: {
  list?: { data: unknown; error: unknown }
  rpc?: { data: unknown; error: unknown }
}) {
  const chain: Record<string, unknown> = {}
  const ret = () => chain
  chain.select = vi.fn(ret)
  chain.eq = vi.fn(ret)
  chain.order = vi.fn(ret)
  chain.limit = vi.fn(async () => opts.list ?? { data: [], error: null })
  return {
    from: vi.fn(() => chain),
    rpc: vi.fn(async () => opts.rpc ?? { data: null, error: null }),
  }
}

function ctx(id: string = PROJECT, vid: string = VID) {
  return { params: Promise.resolve({ id, vid }) }
}

const OK = { linked_kind: "dd_finding", linked_id: FINDING, note: "Basis Peer-Set" }

function post(body: unknown) {
  return POST(
    new Request("http://t", { method: "POST", body: JSON.stringify(body) }),
    ctx()
  )
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("GET .../valuations/[vid]/links", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({}) })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(401)
  })

  it("400 invalid valuation id", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({}) })
    expect((await GET(new Request("http://t"), ctx(PROJECT, "nope"))).status).toBe(400)
  })

  it("200 lists links (both-sides need-to-know applied server-side)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ list: { data: [{ id: LINK, linked_id: FINDING }], error: null } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await GET(new Request("http://t"), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).links).toHaveLength(1)
  })
})

describe("POST .../valuations/[vid]/links", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({}) })
    expect((await post(OK)).status).toBe(401)
  })

  it("400 on an unsupported linked_kind", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({}) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await post({ ...OK, linked_kind: "synergy_hypothesis" })).status).toBe(400)
  })

  it("201 creates a link", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ rpc: { data: { id: LINK }, error: null } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await post(OK)
    expect(res.status).toBe(201)
    expect((await res.json()).link.id).toBe(LINK)
  })

  it("403 when the caller lacks clearance for the link target (42501)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ rpc: { data: null, error: { code: "42501", message: "no" } } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await post(OK)).status).toBe(403)
  })

  it("422 when the target belongs to another project (23514)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ rpc: { data: null, error: { code: "23514", message: "other project" } } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await post(OK)).status).toBe(422)
  })
})

describe("DELETE .../valuations/[vid]/links", () => {
  it("400 without a linkId query param", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({}) })
    const res = await DELETE(new Request("http://t", { method: "DELETE" }), ctx())
    expect(res.status).toBe(400)
  })

  it("200 removes the link", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ rpc: { data: true, error: null } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await DELETE(
      new Request(`http://t?linkId=${LINK}`, { method: "DELETE" }),
      ctx()
    )
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  it("404 when the link does not exist (P0002)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ rpc: { data: null, error: { code: "P0002", message: "gone" } } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await DELETE(
      new Request(`http://t?linkId=${LINK}`, { method: "DELETE" }),
      ctx()
    )
    expect(res.status).toBe(404)
  })
})
