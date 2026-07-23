import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthMock, accessMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  accessMock: vi.fn(),
}))

vi.mock("@/app/api/_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, getAuthenticatedUserId: getAuthMock, requireProjectAccess: accessMock }
})

import { POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const PARENT = "dddddddd-4444-4444-8444-dddddddddddd"
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
/** Sequential per-`from()` results; last entry repeats if calls exceed list. */
function supa(results: Result[]) {
  let i = 0
  return {
    from: vi.fn(() => chain(results[Math.min(i++, results.length - 1)])),
  }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}
function req(body: unknown) {
  return new Request("http://t/nodes", { method: "POST", body: JSON.stringify(body) })
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("POST /api/projects/[id]/tree/nodes", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa([{ data: null, error: null }]) })
    expect((await POST(req({ name: "X" }), ctx())).status).toBe(401)
  })

  it("403 forwards access error", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa([{ data: null, error: null }]) })
    accessMock.mockResolvedValue({ error: Response.json({ error: {} }, { status: 403 }) })
    expect((await POST(req({ name: "X" }), ctx())).status).toBe(403)
  })

  it("400 missing name", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa([{ data: null, error: null }]) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(req({}), ctx())).status).toBe(400)
  })

  it("201 creates a root folder with a deduped slug", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa([
        { data: [{ slug: "legal" }], error: null }, // sibling slugs
        { data: { id: "n1", node_type: "folder", name: "Legal (2)", slug: "legal-2" }, error: null },
      ]),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(req({ name: "Legal" }), ctx())
    expect(res.status).toBe(201)
    expect((await res.json()).node.slug).toBe("legal-2")
  })

  it("404 when parent belongs to another project", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa([
        { data: { id: PARENT, project_id: "other", node_type: "folder", deleted_at: null }, error: null },
      ]),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(req({ name: "X", parent_id: PARENT }), ctx())
    expect(res.status).toBe(404)
  })

  it("400 when parent is not a folder", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa([
        { data: { id: PARENT, project_id: PROJECT, node_type: "document", deleted_at: null }, error: null },
      ]),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(req({ name: "X", parent_id: PARENT }), ctx())
    expect(res.status).toBe(400)
  })

  it("409 on unique-violation from DB", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa([
        { data: [], error: null },
        { data: null, error: { code: "23505", message: "dup" } },
      ]),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(req({ name: "Legal" }), ctx())
    expect(res.status).toBe(409)
  })
})
