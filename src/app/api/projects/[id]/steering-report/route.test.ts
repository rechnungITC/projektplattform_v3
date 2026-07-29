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

describe("GET /api/projects/[id]/steering-report", () => {
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

  it("200 returns the bundled steering report via the INVOKER RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: {
        deal_status: {
          lifecycle_status: "active",
          current_phase: { id: "p1", name: "Signing", sequence_number: 1, status: "in_progress" },
          phase_summary: { total: 2, planned: 1, in_progress: 1, completed: 0, suspended: 0, cancelled: 0 },
        },
        next_stage_gate: { id: "g1", sequence_number: 1, status: "pending", target_phase_id: null, target_phase_name: null, confidentiality_level: "standard" },
        stage_gate_summary: { total: 2, pending: 2, passed: 0, conditional: 0, aborted: 0 },
        red_flags: {
          findings: [{ id: "f1", severity: "deal_breaker", title: "X" }],
          risks: [{ id: "r1", score: 20, severity_bucket: "critical", title: "Y" }],
          summary: { finding_deal_breaker: 1, finding_hoch: 0, risk_critical: 1, risk_high: 0, total: 2 },
        },
        critical_tasks: {
          tasks: [{ id: "w1", title: "T", is_overdue: true, days_overdue: 4, is_blocked: false }],
          summary: { open_total: 1, overdue_total: 1, due_today_total: 0, due_this_week_total: 0, blocked_total: 0, critical_total: 1 },
        },
        pre_read: {
          lifecycle_status: "active",
          current_phase_name: "Signing",
          next_gate_sequence: 1,
          next_gate_status: "pending",
          open_red_flag_findings: 1,
          open_high_risks: 1,
          critical_tasks: 1,
        },
      },
      error: null,
    })
    const res = await get()
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("steering_report", {
      p_project_id: PROJECT,
    })
    const json = (await res.json()) as {
      red_flags: { findings: unknown[]; risks: unknown[] }
      pre_read: { open_red_flag_findings: number; critical_tasks: number }
    }
    expect(json.red_flags.findings).toHaveLength(1)
    expect(json.red_flags.risks).toHaveLength(1)
    expect(json.pre_read.open_red_flag_findings).toBe(1)
    expect(json.pre_read.critical_tasks).toBe(1)
  })

  it("normalises a null RPC result to an empty report", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: null, error: null })
    const res = await get()
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      red_flags: { findings: unknown[] }
      next_stage_gate: unknown
      pre_read: { critical_tasks: number }
    }
    expect(json.red_flags.findings).toEqual([])
    expect(json.next_stage_gate).toBeNull()
    expect(json.pre_read.critical_tasks).toBe(0)
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
