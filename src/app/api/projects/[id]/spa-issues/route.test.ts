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
const OTHER = "dddddddd-4444-4444-8444-dddddddddddd"

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
function post(body: unknown) {
  return POST(
    new Request("http://t/", { method: "POST", body: JSON.stringify(body) }),
    ctx()
  )
}

beforeEach(() => {
  queue.length = 0
  getUserMock.mockReset()
  rpcMock.mockReset()
  fromMock.mockClear()
})

describe("GET /api/projects/[id]/spa-issues", () => {
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

  it("lists issues for a member", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    const list = newQueryChain()
    list.limit.mockResolvedValue({
      data: [{ id: "i1", issue_number: 1, status: "open" }],
      error: null,
    })
    queue.push(list)
    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(200)
    expect(((await res.json()) as { issues: unknown[] }).issues).toHaveLength(1)
  })

  it("applies known filters and ignores unknown filter values", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    const list = newQueryChain()
    list.limit.mockResolvedValue({ data: [], error: null })
    queue.push(list)
    await GET(
      new Request(
        `http://t/?status=escalated&category=warranty&importance=bogus&responsibleId=${OTHER}`
      ),
      ctx()
    )
    const cols = list.eq.mock.calls.map((c) => c[0])
    expect(cols).toContain("status")
    expect(cols).toContain("category")
    expect(cols).toContain("responsible_user_id")
    // "bogus" is not a valid importance -> must not become a filter
    expect(cols).not.toContain("importance")
  })
})

describe("POST /api/projects/[id]/spa-issues", () => {
  it("401 unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await post({ title: "X" })).status).toBe(401)
  })

  it("400 on missing title", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    expect((await post({ category: "warranty" })).status).toBe(400)
  })

  it("400 on invalid category", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    expect((await post({ title: "X", category: "nonsense" })).status).toBe(400)
  })

  it("400 on malformed due_date", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    expect((await post({ title: "X", due_date: "31.12.2026" })).status).toBe(400)
  })

  it("201 creates via RPC and defaults confidentiality to 'confidential'", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: { id: "i1", issue_number: 1 },
      error: null,
    })
    const res = await post({ title: "Garantiekatalog", category: "warranty" })
    expect(res.status).toBe(201)
    expect(rpcMock).toHaveBeenCalledWith(
      "create_spa_issue",
      expect.objectContaining({
        p_project_id: PROJECT,
        p_title: "Garantiekatalog",
        p_category: "warranty",
        p_confidentiality_level: "confidential",
      })
    )
  })

  it("403 maps RPC 42501 (role or clearance)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "denied" },
    })
    expect((await post({ title: "X" })).status).toBe(403)
  })

  it("404 maps RPC P0002 (project not found)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "no project" },
    })
    expect((await post({ title: "X" })).status).toBe(404)
  })

  it("400 maps RPC 23514 (cross-project link smuggling)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "linked finding does not belong" },
    })
    expect((await post({ title: "X", linked_finding_id: OTHER })).status).toBe(400)
  })
})
