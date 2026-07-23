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

describe("GET /api/projects/[id]/task-bottlenecks", () => {
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
        tasks: [{ id: "w1", title: "T", is_overdue: true, days_overdue: 4 }],
        top_bottlenecks: [{ id: "w1", days_overdue: 4 }],
        summary: {
          open_total: 1,
          overdue_total: 1,
          due_today_total: 0,
          due_this_week_total: 0,
          blocked_total: 0,
        },
      },
      error: null,
    })
    const res = await get()
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("project_task_bottlenecks", {
      p_project_id: PROJECT,
    })
    const json = (await res.json()) as { tasks: unknown[] }
    expect(json.tasks).toHaveLength(1)
  })

  it("normalises a null RPC result to an empty overview", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: null, error: null })
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      tasks: [],
      top_bottlenecks: [],
      summary: { open_total: 0, overdue_total: 0, blocked_total: 0 },
    })
  })

  it("500 maps an RPC error", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "boom" },
    })
    expect((await get()).status).toBe(500)
  })
})
