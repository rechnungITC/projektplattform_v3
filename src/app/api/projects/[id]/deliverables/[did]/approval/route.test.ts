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

import { GET, POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const DID = "dddddddd-4444-4444-8444-dddddddddddd"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"
const STK = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"

function selectChain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ["select", "eq", "order"]) c[m] = vi.fn(() => c)
  c.limit = vi.fn(async () => result)
  return c
}
function supa(opts: {
  fromResult?: { data: unknown; error: unknown }
  rpcResult?: { data: unknown; error: unknown }
}) {
  return {
    from: vi.fn(() => selectChain(opts.fromResult ?? { data: [], error: null })),
    rpc: vi.fn(async () => opts.rpcResult ?? { data: null, error: null }),
  }
}
function ctx() {
  return { params: Promise.resolve({ id: PROJECT, did: DID }) }
}
function postReq(body: unknown) {
  return new Request("http://t/approval", { method: "POST", body: JSON.stringify(body) })
}

beforeEach(() => {
  getAuthMock.mockReset()
  accessMock.mockReset()
})

describe("GET /api/projects/[id]/deliverables/[did]/approval", () => {
  it("401 unauthenticated", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: supa({}) })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(401)
  })
  it("lists approvals (200)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ fromResult: { data: [{ id: "a1", status: "pending" }], error: null } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await GET(new Request("http://t"), ctx())
    expect(res.status).toBe(200)
    expect((await res.json()).approvals).toHaveLength(1)
  })
  it("forwards access error (403)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({}) })
    accessMock.mockResolvedValue({ error: Response.json({ error: {} }, { status: 403 }) })
    expect((await GET(new Request("http://t"), ctx())).status).toBe(403)
  })
})

describe("POST /api/projects/[id]/deliverables/[did]/approval (submit)", () => {
  it("400 empty approver list", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({}) })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(postReq({ approver_stakeholder_ids: [] }), ctx())).status).toBe(400)
  })
  it("201 submits", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ rpcResult: { data: { id: "a1", status: "pending" }, error: null } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    const res = await POST(postReq({ approver_stakeholder_ids: [STK] }), ctx())
    expect(res.status).toBe(201)
    expect((await res.json()).approval.id).toBe("a1")
  })
  it("409 when a pending workflow already exists (23505)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ rpcResult: { data: null, error: { code: "23505", message: "dup" } } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(postReq({ approver_stakeholder_ids: [STK] }), ctx())).status).toBe(409)
  })
  it("422 when deliverable not in_review (23514)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ rpcResult: { data: null, error: { code: "23514", message: "not in_review" } } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(postReq({ approver_stakeholder_ids: [STK] }), ctx())).status).toBe(422)
  })
  it("403 SoD/role violation (42501)", async () => {
    getAuthMock.mockResolvedValue({
      userId: ME,
      supabase: supa({ rpcResult: { data: null, error: { code: "42501", message: "sod" } } }),
    })
    accessMock.mockResolvedValue({ project: { id: PROJECT, tenant_id: "t1" } })
    expect((await POST(postReq({ approver_stakeholder_ids: [STK] }), ctx())).status).toBe(403)
  })
  it("forwards manage_members access error (403)", async () => {
    getAuthMock.mockResolvedValue({ userId: ME, supabase: supa({}) })
    accessMock.mockResolvedValue({ error: Response.json({ error: {} }, { status: 403 }) })
    expect((await POST(postReq({ approver_stakeholder_ids: [STK] }), ctx())).status).toBe(403)
  })
})