import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthMock, accessMock, signMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  accessMock: vi.fn(),
  signMock: vi.fn(),
}))

vi.mock("@/app/api/_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, getAuthenticatedUserId: getAuthMock, requireProjectAccess: accessMock }
})
vi.mock("@/lib/dms/storage", () => ({ createDocumentSignedUrl: signMock }))

import { GET } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const DOC = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

type Result = { data: unknown; error: unknown }
function chain(result: Result) {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "eq", "is", "order", "limit"]) c[m] = vi.fn(() => c)
  c.single = vi.fn(async () => result)
  c.maybeSingle = vi.fn(async () => result)
  c.then = (resolve: (r: unknown) => unknown) => resolve(result)
  return c
}
function supa(result: Result) {
  return { from: vi.fn(() => chain(result)) }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT, docId: DOC }) }
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
  signMock.mockReset()
})

describe("GET /api/projects/[id]/documents/[docId]/download", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({ data: null, error: null }) })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(401)
  })

  it("400 invalid doc id", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    const res = await GET(new Request("http://t"), {
      params: Promise.resolve({ id: PROJECT, docId: "nope" }),
    })
    expect(res.status).toBe(400)
  })

  it("403 forwards access error", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ error: Response.json({ error: {} }, { status: 403 }) })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(403)
  })

  it("200 returns a signed url", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({
        data: { id: DOC, storage_path: "t1/p/n/doc.pdf", deleted_at: null, document_tree_nodes: { project_id: PROJECT } },
        error: null,
      }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    signMock.mockResolvedValue("https://signed-url")
    const res = await GET(new Request("http://t"), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).url).toBe("https://signed-url")
  })

  it("404 when the document belongs to another project", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({
        data: { id: DOC, storage_path: "x", deleted_at: null, document_tree_nodes: { project_id: "other" } },
        error: null,
      }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(404)
  })

  it("404 when the document is missing", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(404)
  })
})
