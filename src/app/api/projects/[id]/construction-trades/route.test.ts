import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-45-α — per-project trade assignment route tests.
// The uniqueness rule (AC-45.9) and the deactivated-trade rule (AC-45.4) live
// in the database; what is asserted here is that this route maps them to
// meaningful status codes instead of leaking a 500.

const { getAuthMock, accessMock, moduleMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  accessMock: vi.fn(),
  moduleMock: vi.fn(),
}))

vi.mock("@/app/api/_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    getAuthenticatedUserId: getAuthMock,
    requireProjectAccess: accessMock,
  }
})

vi.mock("@/lib/tenant-settings/server", () => ({
  requireModuleActive: moduleMock,
}))

import { GET, POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const TENANT = "dddddddd-4444-4444-8444-dddddddddddd"
const TRADE = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

let lastInsert: Record<string, unknown> | undefined
let lastSelect: string | undefined

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  c.select = vi.fn((cols?: string) => {
    if (cols) lastSelect = cols
    return c
  })
  for (const m of ["eq", "order"]) c[m] = vi.fn(() => c)
  c.insert = vi.fn((payload: Record<string, unknown>) => {
    lastInsert = payload
    return c
  })
  for (const t of ["limit", "single", "maybeSingle"]) c[t] = vi.fn(async () => result)
  return c
}
function supa(result: { data: unknown; error: unknown }) {
  return { from: vi.fn(() => chain(result)) }
}
function ctx(id: string = PROJECT) {
  return { params: Promise.resolve({ id }) }
}
function postReq(body: unknown) {
  return new Request("http://t/construction-trades", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  lastInsert = undefined
  lastSelect = undefined
  getAuthMock.mockReset()
  accessMock.mockReset()
  getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: [], error: null }) })
  accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: TENANT } })
  moduleMock.mockResolvedValue(null)
})

describe("GET /api/projects/[id]/construction-trades", () => {
  it("rejects a malformed project id", async () => {
    expect((await GET(new Request("http://t/"), ctx("nope"))).status).toBe(400)
  })

  it("refuses an unauthenticated caller", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({ data: [], error: null }) })
    expect((await GET(new Request("http://t/"), ctx())).status).toBe(401)
  })

  it("joins the catalog label instead of storing a copy (lock L7)", async () => {
    await GET(new Request("http://t/"), ctx())
    expect(lastSelect).toContain("trade:construction_trades(")
  })

  it("answers as if the surface did not exist when the construction module is off", async () => {
    moduleMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "not_found" } }), { status: 404 })
    )
    expect((await GET(new Request("http://t/"), ctx())).status).toBe(404)
  })
})

describe("POST /api/projects/[id]/construction-trades", () => {
  it("requires the edit action", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: { id: "pt1" }, error: null }),
    })
    await POST(postReq({ trade_id: TRADE }), ctx())
    expect(accessMock).toHaveBeenCalledWith(expect.anything(), PROJECT, ME, "edit")
  })

  it("rejects a missing trade_id", async () => {
    expect((await POST(postReq({}), ctx())).status).toBe(422)
  })

  it("rejects an unknown rag_status", async () => {
    const res = await POST(postReq({ trade_id: TRADE, rag_status: "blau" }), ctx())
    expect(res.status).toBe(422)
  })

  it("accepts the three allowed traffic-light values", async () => {
    for (const rag of ["gruen", "gelb", "rot"]) {
      getAuthMock.mockResolvedValue({
        userId: ME,
        supabase: supa({ data: { id: "pt1" }, error: null }),
      })
      const res = await POST(postReq({ trade_id: TRADE, rag_status: rag }), ctx())
      expect(res.status, `rag_status ${rag}`).toBe(201)
    }
  })

  it("stamps project, tenant and author", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: { id: "pt1" }, error: null }),
    })
    await POST(postReq({ trade_id: TRADE }), ctx())
    expect(lastInsert).toMatchObject({
      trade_id: TRADE,
      project_id: PROJECT,
      tenant_id: TENANT,
      created_by: ME,
    })
  })

  it("maps a second assignment of the same trade to 409 (AC-45.9)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: { code: "23505", message: "dup" } }),
    })
    const res = await POST(postReq({ trade_id: TRADE }), ctx())
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe("already_assigned")
  })

  it("maps a deactivated trade to 422, not 500 (AC-45.4)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: { code: "23514", message: "deactivated" } }),
    })
    expect((await POST(postReq({ trade_id: TRADE }), ctx())).status).toBe(422)
  })
})
