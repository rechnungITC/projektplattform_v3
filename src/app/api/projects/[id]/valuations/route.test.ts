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
const V1 = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

// PROJ-120 — the POST path delegates to the SECURITY DEFINER RPC
// add_ma_valuation_version; the GET path is a plain RLS-scoped select.
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

function ctx(id: string = PROJECT) {
  return { params: Promise.resolve({ id }) }
}

const OK = {
  title: "Indikative Bewertung",
  valuation_date: "2026-08-01",
  method: "multiple",
  value_low: 45000000,
  value_high: 55000000,
}

function post(body: unknown, id = PROJECT) {
  return POST(
    new Request("http://t", { method: "POST", body: JSON.stringify(body) }),
    ctx(id)
  )
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("GET .../valuations", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({}) })
    const res = await GET(new Request("http://t"), ctx())
    expect(res.status).toBe(401)
  })

  it("400 invalid project id", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({}) })
    const res = await GET(new Request("http://t"), ctx("not-a-uuid"))
    expect(res.status).toBe(400)
  })

  it("200 returns the version chain", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({
        list: { data: [{ id: V1, version_no: 1, is_current: true }], error: null },
      }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await GET(new Request("http://t"), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).valuations[0].is_current).toBe(true)
  })
})

describe("POST .../valuations", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({}) })
    expect((await post(OK)).status).toBe(401)
  })

  it("400 on an unknown valuation method", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({}) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await post({ ...OK, method: "astrology" })).status).toBe(400)
  })

  it("400 when the band is inverted (value_high < value_low)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({}) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect(
      (await post({ ...OK, value_low: 90000000, value_high: 10000000 })).status
    ).toBe(400)
  })

  it("400 on an unsupported currency", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({}) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await post({ ...OK, currency: "XYZ" })).status).toBe(400)
  })

  it("201 creates a version", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ rpc: { data: { id: V1, version_no: 1 }, error: null } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await post(OK)
    expect(res.status).toBe(201)
    expect((await res.json()).valuation.id).toBe(V1)
  })

  it("403 when the RPC rejects role or clearance (42501)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ rpc: { data: null, error: { code: "42501", message: "no" } } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await post(OK)).status).toBe(403)
  })

  it("422 on a non-M&A project (P0001)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ rpc: { data: null, error: { code: "P0001", message: "no" } } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await post(OK)).status).toBe(422)
  })

  it("422 when a second chain is attempted without supersedes (23514)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({
        rpc: { data: null, error: { code: "23514", message: "a current valuation exists" } },
      }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await post(OK)).status).toBe(422)
  })
})
