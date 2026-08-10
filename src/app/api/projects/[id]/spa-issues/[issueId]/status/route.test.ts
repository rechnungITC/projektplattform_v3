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

import { POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const ISSUE = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function ctx() {
  return { params: Promise.resolve({ id: PROJECT, issueId: ISSUE }) }
}
function queueProjectView() {
  const proj = newQueryChain()
  proj.maybeSingle.mockResolvedValue({
    data: { id: PROJECT, tenant_id: "t1" },
    error: null,
  })
  queue.push(proj)
}
function post(body: unknown) {
  return POST(
    new Request("http://t/", { method: "POST", body: JSON.stringify(body) }),
    ctx()
  )
}

beforeEach(() => {
  queue.length = 0
  getUserMock.mockReset()
  rpcMock.mockReset()
  fromMock.mockClear()
})

describe("POST /api/projects/[id]/spa-issues/[issueId]/status", () => {
  it("401 unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await post({ status: "agreed" })).status).toBe(401)
  })

  it("400 on an unknown status", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    expect((await post({ status: "nonsense" })).status).toBe(400)
  })

  it("transitions via RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: { id: ISSUE, status: "escalated" },
      error: null,
    })
    const res = await post({ status: "escalated" })
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("transition_spa_issue_status", {
      p_issue_id: ISSUE,
      p_status: "escalated",
    })
  })

  it("allows re-opening an agreed issue (negotiation is non-linear)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: { id: ISSUE, status: "open" }, error: null })
    expect((await post({ status: "open" })).status).toBe(200)
  })

  it("403 maps RPC 42501", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "denied" },
    })
    expect((await post({ status: "closed" })).status).toBe(403)
  })
})
