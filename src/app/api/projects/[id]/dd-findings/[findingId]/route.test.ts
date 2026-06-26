import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()
const rpcMock = vi.fn()

interface QueryChain {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}
function newQueryChain(): QueryChain {
  const c = {} as QueryChain
  c.select = vi.fn().mockReturnValue(c)
  c.eq = vi.fn().mockReturnValue(c)
  c.maybeSingle = vi.fn()
  return c
}
const queue: QueryChain[] = []
const fromMock = vi.fn(() => {
  const next = queue.shift()
  if (!next) throw new Error("from() queue empty")
  return next
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))

import { PATCH } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const FINDING = "ffffffff-7777-4777-8777-ffffffffffff"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function ctx() {
  return { params: Promise.resolve({ id: PROJECT, findingId: FINDING }) }
}
function queueProjectView() {
  const proj = newQueryChain()
  proj.maybeSingle.mockResolvedValue({ data: { id: PROJECT, tenant_id: "t1" }, error: null })
  queue.push(proj)
}
function patch(body: unknown) {
  return PATCH(new Request("http://t/", { method: "PATCH", body: JSON.stringify(body) }), ctx())
}

beforeEach(() => {
  queue.length = 0
  getUserMock.mockReset()
  rpcMock.mockReset()
  fromMock.mockClear()
})

describe("PATCH /api/projects/[id]/dd-findings/[findingId]", () => {
  it("401 unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await patch({ status: "in_review" })).status).toBe(401)
  })
  it("400 on empty body", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    expect((await patch({})).status).toBe(400)
  })
  it("400 on invalid severity", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    expect((await patch({ severity: "nope" })).status).toBe(400)
  })
  it("200 updates via RPC (→ deal_breaker)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: { id: FINDING, severity: "deal_breaker" }, error: null })
    const res = await patch({ severity: "deal_breaker" })
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("update_dd_finding", expect.objectContaining({
      p_finding_id: FINDING,
      p_severity: "deal_breaker",
    }))
  })
  it("403 maps RPC 42501", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } })
    expect((await patch({ status: "resolved" })).status).toBe(403)
  })
  it("404 maps RPC P0002", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: null, error: { code: "P0002", message: "not found" } })
    expect((await patch({ status: "resolved" })).status).toBe(404)
  })
})
