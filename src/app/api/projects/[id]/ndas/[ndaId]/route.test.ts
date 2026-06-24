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
const NDA = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "eq", "update", "delete"]) c[m] = vi.fn(() => c)
  c.maybeSingle = vi.fn(async () => result)
  return c
}
function supa(result: { data: unknown; error: unknown }) {
  return { from: vi.fn(() => chain(result)) }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT, ndaId: NDA }) }
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("PATCH /api/projects/[id]/ndas/[ndaId]", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({ data: null, error: null }) })
    const req = new Request("http://t", { method: "PATCH", body: JSON.stringify({ status: "valid" }) })
    expect((await PATCH(req, ctx())).status).toBe(401)
  })

  it("transitions NDA status to valid (200)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: { id: NDA, status: "valid" }, error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const req = new Request("http://t", { method: "PATCH", body: JSON.stringify({ status: "valid" }) })
    const res = await PATCH(req, ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).nda.status).toBe("valid")
  })

  it("404 when missing", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const req = new Request("http://t", { method: "PATCH", body: JSON.stringify({ status: "revoked" }) })
    expect((await PATCH(req, ctx())).status).toBe(404)
  })
})

describe("DELETE /api/projects/[id]/ndas/[ndaId]", () => {
  it("deletes (200)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: { id: NDA }, error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await DELETE(new Request("http://t", { method: "DELETE" }), ctx())
    expect(res.status).toBe(200)
  })
})
