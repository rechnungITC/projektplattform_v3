import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()
const rpcMock = vi.fn()

interface QueryChain {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}
function newQueryChain(): QueryChain {
  const chain = {} as QueryChain
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.maybeSingle = vi.fn()
  return chain
}
const queue: { table: string; chain: QueryChain }[] = []
function enqueue(table: string, chain: QueryChain) {
  queue.push({ table, chain })
}
const fromMock = vi.fn((table: string) => {
  const next = queue.shift()
  if (!next) throw new Error(`Unexpected from('${table}')`)
  return next.chain
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))

import { POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const REQ = "ffffffff-6666-4666-8666-ffffffffffff"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function ctx() {
  return { params: Promise.resolve({ id: PROJECT, reqId: REQ }) }
}
function queueProjectView() {
  const proj = newQueryChain()
  proj.maybeSingle.mockResolvedValue({ data: { id: PROJECT, tenant_id: "t1" }, error: null })
  enqueue("projects", proj)
}
function post(body: unknown) {
  return POST(new Request("http://t/", { method: "POST", body: JSON.stringify(body) }), ctx())
}

beforeEach(() => {
  queue.length = 0
  getUserMock.mockReset()
  rpcMock.mockReset()
  fromMock.mockClear()
})

describe("POST .../clearance-requests/[reqId]/respond", () => {
  it("401 unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await post({ action: "approve" })).status).toBe(401)
  })

  it("400 on invalid action", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    expect((await post({ action: "maybe" })).status).toBe(400)
  })

  it("200 records an approval via the RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: { id: REQ, status: "approved" }, error: null })
    const res = await post({ action: "approve" })
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("record_clearance_approval_response", {
      p_request_id: REQ,
      p_action: "approve",
    })
  })

  it("403 maps RPC 42501 (SoD / not an approver)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } })
    expect((await post({ action: "approve" })).status).toBe(403)
  })

  it("409 maps RPC 22023 (not pending)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: null, error: { code: "22023", message: "not pending" } })
    expect((await post({ action: "reject" })).status).toBe(409)
  })

  it("409 maps RPC 23505 (already voted)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: null, error: { code: "23505", message: "dup" } })
    expect((await post({ action: "approve" })).status).toBe(409)
  })

  it("404 maps RPC P0002 (request not found)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: null, error: { code: "P0002", message: "not found" } })
    expect((await post({ action: "approve" })).status).toBe(404)
  })
})
