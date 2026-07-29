import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()
const rpcMock = vi.fn()

interface QueryChain {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  in: ReturnType<typeof vi.fn>
}
function newQueryChain(): QueryChain {
  const c = {} as QueryChain
  c.select = vi.fn().mockReturnValue(c)
  c.eq = vi.fn().mockReturnValue(c)
  c.maybeSingle = vi.fn()
  c.in = vi.fn()
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
function queueProfiles(
  rows: { id: string; display_name: string | null; email: string | null }[]
) {
  const prof = newQueryChain()
  prof.in.mockResolvedValue({ data: rows, error: null })
  queue.push(prof)
}
function get(section?: string) {
  const url = section ? `http://t/?section=${section}` : "http://t/"
  return GET(new Request(url), ctx())
}

beforeEach(() => {
  queue.length = 0
  getUserMock.mockReset()
  rpcMock.mockReset()
  fromMock.mockClear()
})

describe("GET /api/projects/[id]/steering-report/export", () => {
  it("401 unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await get("findings")).status).toBe(401)
  })

  it("400 invalid project id", async () => {
    const res = await GET(new Request("http://t/?section=findings"), {
      params: Promise.resolve({ id: "nope" }),
    })
    expect(res.status).toBe(400)
  })

  it("400 invalid section", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    const res = await get("bogus")
    expect(res.status).toBe(400)
  })

  it("200 findings CSV (no profile lookup needed)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: {
        red_flags: {
          findings: [
            {
              title: "Tax gap",
              stream_label: "Finance",
              severity: "deal_breaker",
              economic_impact_eur: 500000,
              recommended_treatment: "kaufpreisanpassung",
              status: "open",
            },
          ],
        },
      },
      error: null,
    })
    const res = await get("findings")
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toContain("text/csv")
    const csv = await res.text()
    expect(csv.split("\n")[0]).toBe(
      "titel,stream,schwere,wirtschaftlicher_impact_eur,empfohlene_behandlung,status"
    )
    expect(csv).toContain("deal_breaker")
    expect(csv).toContain("500000")
  })

  it("200 risks CSV", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: {
        red_flags: {
          risks: [
            {
              title: "Integration risk",
              workstream_label: "IT",
              probability: 5,
              impact: 5,
              score: 25,
              severity_bucket: "critical",
              status: "open",
            },
          ],
        },
      },
      error: null,
    })
    const res = await get("risks")
    expect(res.status).toBe(200)
    const csv = await res.text()
    expect(csv.split("\n")[0]).toBe(
      "titel,workstream,wahrscheinlichkeit,auswirkung,score,schwere,status"
    )
    expect(csv).toContain("critical")
    expect(csv).toContain("25")
  })

  it("200 tasks CSV with owner-name resolution + formula-injection escaping", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: {
        critical_tasks: {
          tasks: [
            {
              title: "=INJECT()",
              status: "blocked",
              due_date: null,
              days_overdue: 0,
              responsible_user_id: OWNER,
              phase_name: "Signing",
              workstream_label: "Legal",
              is_blocked: true,
            },
          ],
        },
      },
      error: null,
    })
    queueProfiles([{ id: OWNER, display_name: "Alice", email: null }])
    const res = await get("tasks")
    expect(res.status).toBe(200)
    const csv = await res.text()
    const [header, row] = csv.split("\n")
    expect(header).toBe(
      "titel,workstream,phase,verantwortlich,frist,status,tage_ueber_frist,blockiert"
    )
    expect(row).toContain("Alice")
    expect(row).toContain("ja")
    // formula-injection neutralised: leading = is prefixed with '
    expect(row).toContain("'=INJECT()")
  })

  it("500 maps an RPC error", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "boom" },
    })
    expect((await get("findings")).status).toBe(500)
  })
})
