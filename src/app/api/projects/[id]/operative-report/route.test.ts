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

describe("GET /api/projects/[id]/operative-report", () => {
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

  it("200 returns the bundled operative report via the INVOKER RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: {
        tasks_overdue: {
          tasks: [{ id: "w1", title: "T", is_overdue: true, days_overdue: 4 }],
          summary: {
            open_total: 1,
            overdue_total: 1,
            due_today_total: 0,
            due_this_week_total: 0,
            blocked_total: 0,
          },
        },
        findings_by_severity: { streams: [], findings: [] },
        qa_by_stream: [{ dd_stream_id: "s1", stream_label: "Legal", qa_open: 2, qa_answered: 1 }],
        deliverables_status: { deliverables: [], summary: { total: 0 } },
        pre_read: {
          overdue_tasks: 1,
          open_deal_breaker_findings: 0,
          open_qa: 2,
          deliverables_not_approved: 0,
        },
      },
      error: null,
    })
    const res = await get()
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("operative_report", {
      p_project_id: PROJECT,
      p_workstream_id: null,
      p_owner_id: null,
      p_phase_id: null,
      p_classification: null,
    })
    const json = (await res.json()) as {
      tasks_overdue: { tasks: unknown[] }
      pre_read: { overdue_tasks: number; open_qa: number }
    }
    expect(json.tasks_overdue.tasks).toHaveLength(1)
    expect(json.pre_read.overdue_tasks).toBe(1)
    expect(json.pre_read.open_qa).toBe(2)
  })

  it("PROJ-141-γ4/γ5 — threads filter query params to the RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: { tasks_overdue: { tasks: [], summary: {} } },
      error: null,
    })
    const ws = "11111111-2222-4222-8222-333333333333"
    const owner = "44444444-5555-4555-8555-666666666666"
    const phase = "77777777-8888-4888-8888-999999999999"
    const url = `http://t/?workstream_id=${ws}&owner_id=${owner}&phase_id=${phase}&classification=strict`
    const res = await GET(new Request(url), ctx())
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("operative_report", {
      p_project_id: PROJECT,
      p_workstream_id: ws,
      p_owner_id: owner,
      p_phase_id: phase,
      p_classification: "strict",
    })
  })

  it("PROJ-141-γ4/γ5 — 400 on malformed filter query params", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    // Do NOT queue a project-view chain — the route should reject BEFORE auth.
    const res = await GET(
      new Request("http://t/?workstream_id=not-a-uuid"),
      ctx()
    )
    expect(res.status).toBe(400)
    // Also rejects unknown classification value.
    const res2 = await GET(
      new Request("http://t/?classification=top_secret"),
      ctx()
    )
    expect(res2.status).toBe(400)
  })

  it("normalises a null RPC result to an empty report", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: null, error: null })
    const res = await get()
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      tasks_overdue: { tasks: unknown[] }
      qa_by_stream: unknown[]
      pre_read: { overdue_tasks: number }
    }
    expect(json.tasks_overdue.tasks).toEqual([])
    expect(json.qa_by_stream).toEqual([])
    expect(json.pre_read.overdue_tasks).toBe(0)
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
