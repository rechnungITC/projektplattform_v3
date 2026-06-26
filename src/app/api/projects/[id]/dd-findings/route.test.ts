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
const STREAM = "55555555-5555-4555-8555-555555555555"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}
function queueProjectView() {
  const proj = newQueryChain()
  proj.maybeSingle.mockResolvedValue({ data: { id: PROJECT, tenant_id: "t1" }, error: null })
  queue.push(proj)
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

describe("GET /api/projects/[id]/dd-findings", () => {
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
  it("lists findings for a member", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    const list = newQueryChain()
    list.limit.mockResolvedValue({ data: [{ id: "f1", severity: "hoch" }], error: null })
    queue.push(list)
    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(200)
    expect(((await res.json()) as { findings: unknown[] }).findings).toHaveLength(1)
  })
})

describe("POST /api/projects/[id]/dd-findings", () => {
  it("401 unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await post({ dd_stream_id: STREAM, title: "X" })).status).toBe(401)
  })
  it("400 on missing title", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    expect((await post({ dd_stream_id: STREAM })).status).toBe(400)
  })
  it("400 on invalid severity", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    expect((await post({ dd_stream_id: STREAM, title: "X", severity: "huge" })).status).toBe(400)
  })
  it("201 creates via RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: { id: "f1", severity: "mittel" }, error: null })
    const res = await post({ dd_stream_id: STREAM, title: "Altlasten", severity: "mittel" })
    expect(res.status).toBe(201)
    expect(rpcMock).toHaveBeenCalledWith("create_dd_finding", expect.objectContaining({
      p_dd_stream_id: STREAM,
      p_title: "Altlasten",
      p_severity: "mittel",
    }))
  })
  it("403 maps RPC 42501", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } })
    expect((await post({ dd_stream_id: STREAM, title: "X" })).status).toBe(403)
  })
  it("404 maps RPC P0002 (stream not found)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: null, error: { code: "P0002", message: "no stream" } })
    expect((await post({ dd_stream_id: STREAM, title: "X" })).status).toBe(404)
  })
})
