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

import { PATCH } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const ISSUE = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function ctx(issueId = ISSUE) {
  return { params: Promise.resolve({ id: PROJECT, issueId }) }
}
function queueProjectView() {
  const proj = newQueryChain()
  proj.maybeSingle.mockResolvedValue({
    data: { id: PROJECT, tenant_id: "t1" },
    error: null,
  })
  queue.push(proj)
}
function patch(body: unknown, c = ctx()) {
  return PATCH(
    new Request("http://t/", { method: "PATCH", body: JSON.stringify(body) }),
    c
  )
}

beforeEach(() => {
  queue.length = 0
  getUserMock.mockReset()
  rpcMock.mockReset()
  fromMock.mockClear()
})

describe("PATCH /api/projects/[id]/spa-issues/[issueId]", () => {
  it("401 unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await patch({ title: "X" })).status).toBe(401)
  })

  it("400 invalid issue id", async () => {
    expect((await patch({ title: "X" }, ctx("nope"))).status).toBe(400)
  })

  it("400 on an empty body", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    expect((await patch({})).status).toBe(400)
  })

  it("updates via RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: { id: ISSUE, title: "neu" }, error: null })
    const res = await patch({ title: "neu" })
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith(
      "update_spa_issue",
      expect.objectContaining({ p_issue_id: ISSUE, p_title: "neu" })
    )
  })

  it("distinguishes 'clear the field' (null) from 'leave unchanged' (omitted)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: { id: ISSUE }, error: null })
    await patch({ due_date: null })
    const args = rpcMock.mock.calls[0]?.[1] as Record<string, unknown>
    expect(args.p_clear_due_date).toBe(true)
    // responsible_user_id was NOT in the body -> must not be cleared
    expect(args.p_clear_responsible).toBe(false)
  })

  it("passes an empty string through as the 'clear this text field' signal", async () => {
    // Regression guard: the RPC treats NULL as "not supplied" and '' as an
    // explicit clear. If the route coerced '' to null here, a user could never
    // delete a withdrawn negotiation position — it would silently survive.
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({ data: { id: ISSUE }, error: null })
    await patch({ clause_reference: "", own_position: "" })
    const args = rpcMock.mock.calls[0]?.[1] as Record<string, unknown>
    expect(args.p_clause_reference).toBe("")
    expect(args.p_own_position).toBe("")
    // Fields that were not supplied must stay NULL (= keep current value).
    expect(args.p_counterparty_position).toBeNull()
  })

  it("403 maps RPC 42501 (target level above own clearance)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "not cleared" },
    })
    expect((await patch({ confidentiality_level: "strict" })).status).toBe(403)
  })

  it("404 maps RPC P0002", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "missing" },
    })
    expect((await patch({ title: "X" })).status).toBe(404)
  })
})
