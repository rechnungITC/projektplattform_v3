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

import { DELETE, PATCH } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const ADVISOR = "dddddddd-4444-4444-8444-dddddddddddd"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "eq", "update", "delete"]) c[m] = vi.fn(() => c)
  for (const t of ["maybeSingle"]) c[t] = vi.fn(async () => result)
  return c
}
function supa(result: { data: unknown; error: unknown }) {
  return { from: vi.fn(() => chain(result)) }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT, advisorId: ADVISOR }) }
}
function patchReq(body: unknown) {
  return new Request("http://t", { method: "PATCH", body: JSON.stringify(body) })
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("PATCH /api/projects/[id]/advisors/[advisorId]", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({ data: null, error: null }) })
    expect((await PATCH(patchReq({ mandate_status: "active" }), ctx())).status).toBe(401)
  })

  it("400 on empty body", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await PATCH(patchReq({}), ctx())).status).toBe(400)
  })

  it("updates mandate status (200)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: { id: ADVISOR, mandate_status: "active" }, error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await PATCH(patchReq({ mandate_status: "active" }), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).advisor.mandate_status).toBe("active")
  })

  it("404 when not found", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await PATCH(patchReq({ mandate_status: "blocked" }), ctx())).status).toBe(404)
  })
})

describe("DELETE /api/projects/[id]/advisors/[advisorId]", () => {
  it("deletes (200)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: { id: ADVISOR }, error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await DELETE(new Request("http://t", { method: "DELETE" }), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).deleted).toBe(true)
  })

  it("404 when missing", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await DELETE(new Request("http://t", { method: "DELETE" }), ctx())).status).toBe(404)
  })
})
