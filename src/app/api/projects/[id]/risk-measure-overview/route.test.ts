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

import { GET } from "./route"

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
function get() {
  return GET(new Request("http://t/"), ctx())
}

beforeEach(() => {
  queue.length = 0
  getUserMock.mockReset()
  rpcMock.mockReset()
  fromMock.mockClear()
})

describe("GET /api/projects/[id]/risk-measure-overview", () => {
  it("401 unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await get()).status).toBe(401)
  })

  it("400 invalid project id", async () => {
    const res = await GET(new Request("http://t/"), {
      params: Promise.resolve({ id: "nope" }),
    })
    expect(res.status).toBe(400)
  })

  it("200 returns the overview via the INVOKER RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: {
        risks: [{ id: "r1", title: "Risk 1", active_uncovered: true, measures: [] }],
        summary: { risk_total: 1, active_total: 1, active_uncovered: 1, measure_total: 0 },
      },
      error: null,
    })
    const res = await get()
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("risk_measure_overview", {
      p_project_id: PROJECT,
    })
    const json = (await res.json()) as { risks: unknown[] }
    expect(json.risks).toHaveLength(1)
  })

  it("normalises a null RPC result to an empty overview", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: null, error: null })
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      risks: [],
      summary: { risk_total: 0, active_total: 0, active_uncovered: 0, measure_total: 0 },
    })
  })

  it("500 maps an RPC error", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } })
    expect((await get()).status).toBe(500)
  })
})
