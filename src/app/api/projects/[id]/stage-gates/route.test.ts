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

import { GET } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

// Thenable query-builder chain returning a fixed result.
function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "eq", "order", "limit"]) {
    c[m] = vi.fn(() => c)
  }
  ;(c as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    resolve(result)
  return c
}
function supa(result: { data: unknown; error: unknown }) {
  return { from: vi.fn(() => chain(result)) }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("GET .../stage-gates", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({
      userId: null,
      supabase: supa({ data: [], error: null }),
    })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(401)
  })

  it("200 lists gates", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({
        data: [{ id: "g1", gate_key: "gate_1", status: "pending" }],
        error: null,
      }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await GET(new Request("http://t"), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).stage_gates).toHaveLength(1)
  })

  it("500 on db error", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: { message: "boom" } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(500)
  })
})
