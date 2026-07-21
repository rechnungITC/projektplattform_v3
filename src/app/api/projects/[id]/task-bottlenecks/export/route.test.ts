import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()
const rpcMock = vi.fn()

interface QueryChain {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  in: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}
function newQueryChain(): QueryChain {
  const c = {} as QueryChain
  c.select = vi.fn().mockReturnValue(c)
  c.eq = vi.fn().mockReturnValue(c)
  c.in = vi.fn().mockResolvedValue({ data: [], error: null })
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
const OWNER = "dddddddd-4444-4444-8444-dddddddddddd"

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

describe("GET /api/projects/[id]/task-bottlenecks/export", () => {
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

  it("200 emits CSV with header + rows and resolves responsible names", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: {
        tasks: [
          {
            title: "Prüfung Finance",
            status: "in_progress",
            due_date: "2026-07-11",
            days_overdue: 10,
            responsible_user_id: OWNER,
            phase_name: "Due Diligence",
            workstream_label: "Finance",
          },
        ],
      },
      error: null,
    })
    const profiles = newQueryChain()
    profiles.in.mockResolvedValue({
      data: [{ id: OWNER, display_name: "Alex Müller", email: null }],
      error: null,
    })
    queue.push(profiles)

    const res = await get()
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toContain("text/csv")
    expect(res.headers.get("X-Export-Scope")).toBe(
      "task-bottlenecks-visible-to-caller"
    )
    const text = await res.text()
    const [header, row] = text.split("\n")
    expect(header).toBe(
      "titel,workstream,phase,verantwortlich,frist,status,tage_ueber_frist"
    )
    expect(row).toContain("Alex Müller")
    expect(row).toContain("Due Diligence")
    expect(row).toContain("10")
  })

  it("neutralises CSV formula-injection in a task title", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: {
        tasks: [
          {
            title: "=SUM(A1:A9)",
            status: "todo",
            due_date: null,
            days_overdue: 0,
            responsible_user_id: null,
            phase_name: null,
            workstream_label: null,
          },
        ],
      },
      error: null,
    })
    // no responsible ids → no profiles lookup queued
    const res = await get()
    expect(res.status).toBe(200)
    const text = await res.text()
    // leading '=' is prefixed with a quote to defuse the formula
    expect(text).toContain("'=SUM(A1:A9)")
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
