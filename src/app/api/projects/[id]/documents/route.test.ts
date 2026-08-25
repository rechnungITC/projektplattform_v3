// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthMock, accessMock, sniffMock, uploadMock, deleteMock, FakeMimeError } =
  vi.hoisted(() => {
    class FakeMimeError extends Error {
      code: string
      constructor(code: string, msg: string) {
        super(msg)
        this.code = code
        this.name = "DmsMimeError"
      }
    }
    return {
      getAuthMock: vi.fn(),
      accessMock: vi.fn(),
      sniffMock: vi.fn(),
      uploadMock: vi.fn(),
      deleteMock: vi.fn(),
      FakeMimeError,
    }
  })

vi.mock("@/app/api/_lib/route-helpers", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, getAuthenticatedUserId: getAuthMock, requireProjectAccess: accessMock }
})

vi.mock("@/lib/dms/mime", () => ({
  sniffDocumentMime: sniffMock,
  DmsMimeError: FakeMimeError,
}))
vi.mock("@/lib/dms/storage", () => ({
  uploadDocumentFile: uploadMock,
  deleteDocumentFile: deleteMock,
}))

import { POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

type Result = { data: unknown; error: unknown }

/**
 * Mitschrift der Tabellenzugriffe als `"tabelle.methode"`.
 *
 * Ohne sie war die Rollback-Zusicherung blind: sie prüfte nur, dass das
 * gespeicherte Objekt entfernt wird, nicht dass der verwaiste Knoten gelöscht
 * wird — gegengeprüft, indem das Knotenaufräumen entfernt wurde: der Test blieb
 * grün. Seit PROJ-45-ε liegt dieser Pfad im geteilten Aufnahmekern, und dort
 * muss er bewacht sein.
 */
const calls: string[] = []

function chain(table: string, result: Result) {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "eq", "is", "order", "insert", "update", "delete", "neq", "limit"]) {
    c[m] = vi.fn(() => {
      calls.push(`${table}.${m}`)
      return c
    })
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
    from: vi.fn((table: string) =>
      chain(table, results.length ? results[Math.min(i++, results.length - 1)] : def),
    ),
    rpc: vi.fn(async () => rpcResult),
  }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}
function multipartReq(bytes = "hello", filename = "doc.pdf", type = "application/pdf") {
  const fd = new FormData()
  fd.append("file", new File([bytes], filename, { type }))
  return new Request("http://t/documents", { method: "POST", body: fd })
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
  sniffMock.mockReset()
  uploadMock.mockReset()
  deleteMock.mockReset()
  calls.length = 0
})

describe("POST /api/projects/[id]/documents", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa([]) })
    expect((await POST(multipartReq(), ctx())).status).toBe(401)
  })

  it("403 forwards access error", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa([]) })
    accessMock.mockResolvedValue({ error: Response.json({ error: {} }, { status: 403 }) })
    expect((await POST(multipartReq(), ctx())).status).toBe(403)
  })

  it("415 for non-multipart content type", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa([]) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const req = new Request("http://t/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
    expect((await POST(req, ctx())).status).toBe(415)
  })

  it("413 when the content-length header exceeds the cap", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa([]) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const req = new Request("http://t/documents", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        "content-length": "99999999999",
      },
      body: "x",
    })
    expect((await POST(req, ctx())).status).toBe(413)
  })

  it("415 when the MIME sniff rejects the file", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa([]) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    sniffMock.mockRejectedValue(new FakeMimeError("magic_byte_mismatch", "spoof"))
    expect((await POST(multipartReq(), ctx())).status).toBe(415)
  })

  it("413 when the quota would be exceeded", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa([], {
        data: [{ max_bytes: 100, current_usage_bytes: 98, soft_warning_pct: 80 }],
        error: null,
      }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    sniffMock.mockResolvedValue({ mime: "application/pdf", mime_unsupported_for_rag: false })
    const res = await POST(multipartReq("this-is-more-than-two-bytes"), ctx())
    expect(res.status).toBe(413)
    expect((await res.json()).error.code).toBe("quota_exceeded")
  })

  it("201 uploads and records the document", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa(
        [
          { data: [], error: null }, // sibling slugs
          { data: { id: "n1", node_type: "document", name: "doc.pdf", slug: "doc-pdf" }, error: null }, // node insert
          { data: { id: "doc1", storage_path: "t1/p/n1/doc.pdf", mime_type: "application/pdf" }, error: null }, // documents insert
        ],
        { data: [{ max_bytes: 1_000_000, current_usage_bytes: 0, soft_warning_pct: 80 }], error: null },
      ),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    sniffMock.mockResolvedValue({ mime: "application/pdf", mime_unsupported_for_rag: false })
    uploadMock.mockResolvedValue({ path: "t1/p/n1/doc.pdf" })
    const res = await POST(multipartReq(), ctx())
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.node.id).toBe("n1")
    expect(body.document.id).toBe("doc1")
    expect(uploadMock).toHaveBeenCalledOnce()
  })

  it("rolls back the node when the documents insert fails", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa(
        [
          { data: [], error: null },
          { data: { id: "n1", node_type: "document", name: "doc.pdf", slug: "doc-pdf" }, error: null },
          { data: null, error: { code: "500", message: "insert failed" } }, // documents insert fails
        ],
        { data: [{ max_bytes: 1_000_000, current_usage_bytes: 0, soft_warning_pct: 80 }], error: null },
      ),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    sniffMock.mockResolvedValue({ mime: "application/pdf", mime_unsupported_for_rag: false })
    uploadMock.mockResolvedValue({ path: "t1/p/n1/doc.pdf" })
    const res = await POST(multipartReq(), ctx())
    expect(res.status).toBe(500)
    // Orphan cleanup, BOTH halves: the stored object is removed …
    expect(deleteMock).toHaveBeenCalledWith(expect.anything(), "t1/p/n1/doc.pdf")
    // … and the tree node it belonged to is deleted again. Asserting only the
    // object left the node half unguarded (proven: removing the node delete kept
    // this test green).
    expect(calls).toContain("document_tree_nodes.delete")
  })
})
