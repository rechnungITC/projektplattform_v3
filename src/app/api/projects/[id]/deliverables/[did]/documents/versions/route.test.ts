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

import { POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const DID = "dddddddd-4444-4444-8444-dddddddddddd"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function supa(rpcResult: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => rpcResult) }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT, did: DID }) }
}
function req(body: unknown) {
  return new Request("http://t", { method: "POST", body: JSON.stringify(body) })
}
const OK = { title: "SPA v2", url: "https://x/2", version_comment: "review" }

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("POST .../deliverables/[did]/documents/versions", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({ data: null, error: null }) })
    expect((await POST(req(OK), ctx())).status).toBe(401)
  })

  it("400 invalid body (missing url)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(req({ title: "x" }), ctx())).status).toBe(400)
  })

  it("400 invalid body (bad supersedes uuid)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({ data: null, error: null }) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect(
      (await POST(req({ ...OK, supersedes_document_id: "nope" }), ctx())).status
    ).toBe(400)
  })

  it("201 creates a version via the RPC", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: { id: "v2", version_no: 2, is_current: true }, error: null }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(req({ ...OK, supersedes_document_id: null }), ctx())
    expect(res.status).toBe(201)
    expect((await res.json()).document.version_no).toBe(2)
  })

  it("403 when RPC denies (42501)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: { code: "42501", message: "denied" } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(req(OK), ctx())).status).toBe(403)
  })

  it("404 when deliverable not found (P0002)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: { code: "P0002", message: "not found" } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(req(OK), ctx())).status).toBe(404)
  })

  it("400 on supersede-non-current (RPC 23514)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ data: null, error: { code: "23514", message: "not current" } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(req(OK), ctx())).status).toBe(400)
  })
})
