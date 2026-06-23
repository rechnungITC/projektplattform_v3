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
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "eq", "order", "insert"]) c[m] = vi.fn(() => c)
  for (const t of ["limit", "single"]) c[t] = vi.fn(async () => result)
  return c
}
function supa(result: { data: unknown; error: unknown }) {
  return { from: vi.fn(() => chain(result)) }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}
function postReq(body: unknown) {
  return new Request("http://t/ndas", { method: "POST", body: JSON.stringify(body) })
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("GET /api/projects/[id]/ndas", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({ data: [], error: null }) })
    expect((await GET(new Request("http://t/ndas"), ctx())).status).toBe(401)
  })

  it("lists NDAs", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: [{ id: "n1" }], error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await GET(new Request("http://t/ndas"), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).ndas).toHaveLength(1)
  })
})

describe("POST /api/projects/[id]/ndas", () => {
  it("400 on missing counterparty", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(postReq({ status: "valid" }), ctx())).status).toBe(400)
  })

  it("400 on bad date format", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect(
      (await POST(postReq({ counterparty: "X", valid_until: "31-12-2026" }), ctx())).status
    ).toBe(400)
  })

  it("creates an NDA (201)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: { id: "n1", counterparty: "Bank" }, error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(
      postReq({ counterparty: "Bank", covered_level: "strict", valid_until: "2026-12-31" }),
      ctx()
    )
    expect(res.status).toBe(201)
    expect((await res.json()).nda.id).toBe("n1")
  })
})
