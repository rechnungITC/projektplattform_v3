import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()
const rpcMock = vi.fn()

interface QueryChain {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}
function newQueryChain(): QueryChain {
  const c = {} as QueryChain
  c.select = vi.fn().mockReturnValue(c)
  c.eq = vi.fn().mockReturnValue(c)
  c.order = vi.fn().mockReturnValue(c)
  c.limit = vi.fn()
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

import { GET, POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}
function queueProjectView() {
  const proj = newQueryChain()
  proj.maybeSingle.mockResolvedValue({
    data: { id: PROJECT, tenant_id: "t1" },
    error: null,
  })
  queue.push(proj)
}

beforeEach(() => {
  queue.length = 0
  getUserMock.mockReset()
  rpcMock.mockReset()
  fromMock.mockClear()
})

describe("GET /api/projects/[id]/committees", () => {
  it("401 unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await GET(new Request("http://t/"), ctx())).status).toBe(401)
  })

  it("400 invalid project id", async () => {
    const res = await GET(new Request("http://t/"), {
      params: Promise.resolve({ id: "nope" }),
    })
    expect(res.status).toBe(400)
  })

  it("200 lists committees for a member", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    const list = newQueryChain()
    list.limit.mockResolvedValue({
      data: [{ id: "cm1", name: "SteerCo", members: [] }],
      error: null,
    })
    queue.push(list)
    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(200)
    const json = (await res.json()) as { committees: unknown[] }
    expect(json.committees).toHaveLength(1)
  })
})

describe("POST /api/projects/[id]/committees", () => {
  it("400 on invalid body (missing name)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    const res = await POST(
      new Request("http://t/", {
        method: "POST",
        body: JSON.stringify({ purpose: "x" }),
      }),
      ctx()
    )
    expect(res.status).toBe(400)
  })

  it("201 creates via the create_committee RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: { id: "cm1", name: "SteerCo" }, error: null })
    const res = await POST(
      new Request("http://t/", {
        method: "POST",
        body: JSON.stringify({ name: "SteerCo", confidentiality_level: "standard" }),
      }),
      ctx()
    )
    expect(res.status).toBe(201)
    expect(rpcMock).toHaveBeenCalledWith(
      "create_committee",
      expect.objectContaining({ p_project_id: PROJECT, p_name: "SteerCo" })
    )
  })

  it("403 maps an RPC 42501 (not authorized)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: null, error: { code: "42501", message: "no" } })
    const res = await POST(
      new Request("http://t/", {
        method: "POST",
        body: JSON.stringify({ name: "SteerCo" }),
      }),
      ctx()
    )
    expect(res.status).toBe(403)
  })
})
