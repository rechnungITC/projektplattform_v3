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
const WSID = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

// Thenable chain: awaiting the builder itself resolves `result` (for
// delete().eq().eq()); the .maybeSingle terminal resolves it too.
function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => resolve(result),
  }
  for (const m of ["select", "eq", "update", "delete"]) c[m] = vi.fn(() => c)
  c.maybeSingle = vi.fn(async () => result)
  return c
}
function supa(result: { data: unknown; error: unknown }) {
  return { from: vi.fn(() => chain(result)) }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT, wsid: WSID }) }
}
function patchReq(body: unknown) {
  return new Request("http://t", { method: "PATCH", body: JSON.stringify(body) })
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("PATCH /api/projects/[id]/workstreams/[wsid]", () => {
  it("401 when unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({ data: null, error: null }) })
    expect((await PATCH(patchReq({ rag_status: "red" }), ctx())).status).toBe(401)
  })

  it("400 on empty body (no fields)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await PATCH(patchReq({}), ctx())).status).toBe(400)
  })

  it("400 on invalid rag_status", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await PATCH(patchReq({ rag_status: "blue" }), ctx())).status).toBe(400)
  })

  it("updates rag_status (200)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: { id: WSID, rag_status: "red" }, error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await PATCH(patchReq({ rag_status: "red" }), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).workstream.rag_status).toBe("red")
  })

  it("404 when the workstream is not found", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await PATCH(patchReq({ rag_status: "red" }), ctx())).status).toBe(404)
  })

  it("forwards the access error (403)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ error: Response.json({ error: {} }, { status: 403 }) })
    expect((await PATCH(patchReq({ rag_status: "red" }), ctx())).status).toBe(403)
  })
})

describe("DELETE /api/projects/[id]/workstreams/[wsid]", () => {
  it("deletes (200)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await DELETE(new Request("http://t", { method: "DELETE" }), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })
})
