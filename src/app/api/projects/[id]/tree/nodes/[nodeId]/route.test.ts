import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthMock, accessMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  accessMock: vi.fn(),
}))

vi.mock("@/app/api/_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, getAuthenticatedUserId: getAuthMock, requireProjectAccess: accessMock }
})

import { DELETE, PATCH } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const NODE = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"
const NEW_PARENT = "ffffffff-6666-4666-8666-ffffffffffff"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

type Result = { data: unknown; error: unknown }

function chain(result: Result) {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "eq", "is", "order", "insert", "update", "delete", "neq", "limit"]) {
    c[m] = vi.fn(() => c)
  }
  c.single = vi.fn(async () => result)
  c.maybeSingle = vi.fn(async () => result)
  c.then = (resolve: (r: unknown) => unknown) => resolve(result)
  return c
}
function supa(results: Result[], rpcResult: Result = { data: null, error: null }) {
  let i = 0
  const def: Result = { data: null, error: null }
  return {
    from: vi.fn(() => chain(results.length ? results[Math.min(i++, results.length - 1)] : def)),
    rpc: vi.fn(async () => rpcResult),
  }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT, nodeId: NODE }) }
}
function patchReq(body: unknown) {
  return new Request("http://t/n", { method: "PATCH", body: JSON.stringify(body) })
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("PATCH /api/projects/[id]/tree/nodes/[nodeId]", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa([]) })
    expect((await PATCH(patchReq({ name: "X" }), ctx())).status).toBe(401)
  })

  it("403 forwards access error", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa([]) })
    accessMock.mockResolvedValue({ error: Response.json({ error: {} }, { status: 403 }) })
    expect((await PATCH(patchReq({ name: "X" }), ctx())).status).toBe(403)
  })

  it("400 when both name and parent_id are given", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa([]) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await PATCH(patchReq({ name: "X", parent_id: null }), ctx())).status).toBe(400)
  })

  it("400 when neither name nor parent_id is given", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa([]) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await PATCH(patchReq({ sort_order: 3 }), ctx())).status).toBe(400)
  })

  it("200 moves via RPC", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa([], { data: { id: NODE, parent_id: NEW_PARENT }, error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await PATCH(patchReq({ parent_id: NEW_PARENT }), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).node.parent_id).toBe(NEW_PARENT)
  })

  it("409 on cycle move (RPC 23514)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa([], { data: null, error: { code: "23514", message: "cycle" } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await PATCH(patchReq({ parent_id: NEW_PARENT }), ctx())
    expect(res.status).toBe(409)
  })

  it("403 on move without role (RPC 42501)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa([], { data: null, error: { code: "42501", message: "no role" } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await PATCH(patchReq({ parent_id: null }), ctx())).status).toBe(403)
  })

  it("200 renames with dedup", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa([
        { data: { id: NODE, project_id: PROJECT, parent_id: null, slug: "old", deleted_at: null }, error: null },
        { data: [{ slug: "reports" }], error: null },
        { data: { id: NODE, name: "Reports (2)", slug: "reports-2" }, error: null },
      ]),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await PATCH(patchReq({ name: "Reports" }), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).node.slug).toBe("reports-2")
  })

  it("404 rename when node not found / cross-project", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa([{ data: null, error: null }]),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await PATCH(patchReq({ name: "X" }), ctx())).status).toBe(404)
  })
})

describe("DELETE /api/projects/[id]/tree/nodes/[nodeId]", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa([]) })
    expect((await DELETE(new Request("http://t/n"), ctx())).status).toBe(401)
  })

  it("200 returns the soft-deleted count", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa([], { data: 3, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await DELETE(new Request("http://t/n"), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).deleted).toBe(3)
  })

  it("404 when node not found (RPC P0002)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa([], { data: null, error: { code: "P0002", message: "gone" } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await DELETE(new Request("http://t/n"), ctx())).status).toBe(404)
  })
})
