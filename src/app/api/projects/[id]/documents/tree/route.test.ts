import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthMock, accessMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  accessMock: vi.fn(),
}))

vi.mock("@/app/api/_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, getAuthenticatedUserId: getAuthMock, requireProjectAccess: accessMock }
})

import { GET } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

/** Thenable chain: every builder method returns the chain; awaiting it (or a
 *  terminal) resolves to `result`. */
function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "eq", "is", "order", "insert", "update", "delete", "neq", "limit"]) {
    c[m] = vi.fn(() => c)
  }
  c.single = vi.fn(async () => result)
  c.maybeSingle = vi.fn(async () => result)
  c.then = (resolve: (r: unknown) => unknown) => resolve(result)
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

describe("GET /api/projects/[id]/documents/tree", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({ data: [], error: null }) })
    expect((await GET(new Request("http://t/x"), ctx())).status).toBe(401)
  })

  it("400 invalid project id", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: [], error: null }) })
    const res = await GET(new Request("http://t/x"), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    })
    expect(res.status).toBe(400)
  })

  it("403 forwards access error", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: [], error: null }) })
    accessMock.mockResolvedValue({ error: Response.json({ error: {} }, { status: 403 }) })
    expect((await GET(new Request("http://t/x"), ctx())).status).toBe(403)
  })

  it("200 lists and flattens the linked document metadata", async () => {
    const rows = [
      {
        id: "f1",
        node_type: "folder",
        name: "Legal",
        documents: [],
      },
      {
        id: "d1",
        node_type: "document",
        name: "loi.pdf",
        documents: [
          { id: "doc1", mime_type: "application/pdf", size_bytes: 10, original_filename: "loi.pdf", deleted_at: null },
          { id: "doc0", mime_type: "application/pdf", size_bytes: 5, original_filename: "old.pdf", deleted_at: "2026-01-01" },
        ],
      },
    ]
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: rows, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await GET(new Request("http://t/x"), ctx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.nodes).toHaveLength(2)
    expect(body.nodes[0].document).toBeNull()
    expect(body.nodes[1].document).toEqual({
      id: "doc1",
      mime_type: "application/pdf",
      size_bytes: 10,
      original_filename: "loi.pdf",
    })
  })

  it("400 invalid parent_id filter", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: [], error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await GET(new Request("http://t/x?parent_id=bad"), ctx())
    expect(res.status).toBe(400)
  })

  it("200 with ?all=true returns the whole tree (no parent filter error)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: [{ id: "f1", node_type: "folder", name: "A", documents: [] }], error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await GET(new Request("http://t/x?all=true"), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).nodes).toHaveLength(1)
  })
})
