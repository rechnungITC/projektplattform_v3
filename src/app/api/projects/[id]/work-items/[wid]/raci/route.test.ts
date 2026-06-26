import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-97b — RACI route: GET / POST / DELETE.
const getUserMock = vi.fn()
const rpcMock = vi.fn()

interface Chain {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
}
const queue: { table: string; chain: Chain }[] = []
function enqueue(table: string, chain: Chain) {
  queue.push({ table, chain })
}
const fromMock = vi.fn((table: string) => {
  const next = queue.shift()
  if (!next) throw new Error(`Unexpected from('${table}') — queue empty`)
  if (next.table !== table)
    throw new Error(`Expected from('${next.table}') but got from('${table}')`)
  return next.chain
})
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))

import { DELETE, GET, POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const WID = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"
function ctx(id = PROJECT, wid = WID) {
  return { params: Promise.resolve({ id, wid }) }
}
function queueViewAccess() {
  const proj = {} as Chain
  proj.select = vi.fn().mockReturnValue(proj)
  proj.eq = vi.fn().mockReturnValue(proj)
  proj.maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: { id: PROJECT, tenant_id: "t1" }, error: null })
  enqueue("projects", proj)
}
function req(body?: unknown, method = "POST") {
  return new Request("http://t/", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

beforeEach(() => {
  queue.length = 0
  getUserMock.mockReset()
  rpcMock.mockReset()
  fromMock.mockClear()
})

describe("RACI route /api/projects/[id]/work-items/[wid]/raci", () => {
  it("GET 400 on invalid work item id", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    const res = await GET(req(undefined, "GET"), ctx(PROJECT, "nope"))
    expect(res.status).toBe(400)
  })

  it("GET 401 unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(req(undefined, "GET"), ctx())
    expect(res.status).toBe(401)
  })

  it("GET lists assignments for the work item", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    const raci = {} as Chain
    raci.select = vi.fn().mockReturnValue(raci)
    raci.eq = vi.fn().mockReturnValue(raci)
    raci.limit = vi.fn().mockResolvedValue({
      data: [{ id: "r1", role_key: "deal_lead", raci_letter: "A" }],
      error: null,
    })
    enqueue("raci_assignments", raci)
    const res = await GET(req(undefined, "GET"), ctx())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { assignments: { role_key: string }[] }
    expect(body.assignments[0]?.role_key).toBe("deal_lead")
  })

  it("POST 400 on unknown role_key", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    const res = await POST(
      req({ role_key: "made_up", raci_letter: "A" }),
      ctx()
    )
    expect(res.status).toBe(400)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("POST 400 on invalid raci_letter", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    const res = await POST(
      req({ role_key: "deal_lead", raci_letter: "Z" }),
      ctx()
    )
    expect(res.status).toBe(400)
  })

  it("POST 200 sets RACI via the RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    rpcMock.mockResolvedValue({
      data: { id: "r1", work_item_id: WID, role_key: "deal_lead", raci_letter: "A" },
      error: null,
    })
    const res = await POST(req({ role_key: "deal_lead", raci_letter: "A" }), ctx())
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("set_work_item_raci", {
      p_work_item_id: WID,
      p_role_key: "deal_lead",
      p_raci_letter: "A",
    })
  })

  it("POST 409 when another role is already Accountable (RPC 23505)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    })
    const res = await POST(req({ role_key: "cfo_finance", raci_letter: "A" }), ctx())
    expect(res.status).toBe(409)
  })

  it("POST 403 on RPC authority denial (42501)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "insufficient role" },
    })
    const res = await POST(req({ role_key: "deal_lead", raci_letter: "C" }), ctx())
    expect(res.status).toBe(403)
  })

  it("DELETE clears RACI via the RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    rpcMock.mockResolvedValue({ data: { deleted: 1 }, error: null })
    const res = await DELETE(req({ role_key: "deal_lead" }, "DELETE"), ctx())
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("clear_work_item_raci", {
      p_work_item_id: WID,
      p_role_key: "deal_lead",
    })
  })
})