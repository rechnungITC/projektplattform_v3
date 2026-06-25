import { beforeEach, describe, expect, it, vi } from "vitest"

// Mocks model the from()-chains requireProjectAccess triggers plus rpc().
const getUserMock = vi.fn()
const rpcMock = vi.fn()

interface QueryChain {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}

function newQueryChain(): QueryChain {
  const chain = {} as QueryChain
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.maybeSingle = vi.fn()
  return chain
}

const queue: { table: string; chain: QueryChain }[] = []
function enqueue(table: string, chain: QueryChain) {
  queue.push({ table, chain })
}

const fromMock = vi.fn((table: string) => {
  const next = queue.shift()
  if (!next) throw new Error(`Unexpected from('${table}') — queue empty`)
  if (next.table !== table) {
    throw new Error(`Expected from('${next.table}') but got from('${table}')`)
  }
  return next.chain
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))

import { POST, GET } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const TARGET = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}

// requireProjectAccess(manage_members): projects, then tenant_memberships + project_memberships
function queueAccess(opts: { tenantRole?: string | null; projectRole?: string | null }) {
  const proj = newQueryChain()
  proj.maybeSingle.mockResolvedValue({
    data: { id: PROJECT, tenant_id: "t1" },
    error: null,
  })
  enqueue("projects", proj)

  const tm = newQueryChain()
  tm.maybeSingle.mockResolvedValue({
    data: opts.tenantRole ? { role: opts.tenantRole } : null,
    error: null,
  })
  enqueue("tenant_memberships", tm)

  const pm = newQueryChain()
  pm.maybeSingle.mockResolvedValue({
    data: opts.projectRole ? { role: opts.projectRole } : null,
    error: null,
  })
  enqueue("project_memberships", pm)
}

beforeEach(() => {
  queue.length = 0
  getUserMock.mockReset()
  rpcMock.mockReset()
  fromMock.mockClear()
})

describe("POST /api/projects/[id]/clearances (grant)", () => {
  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(
      new Request("http://t/", {
        method: "POST",
        body: JSON.stringify({ user_id: TARGET, max_level: "confidential" }),
      }),
      ctx()
    )
    expect(res.status).toBe(401)
  })

  it("400 on invalid body (missing user_id)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    const res = await POST(
      new Request("http://t/", {
        method: "POST",
        body: JSON.stringify({ max_level: "confidential" }),
      }),
      ctx()
    )
    expect(res.status).toBe(400)
  })

  it("400 on disallowed level 'standard'", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    const res = await POST(
      new Request("http://t/", {
        method: "POST",
        body: JSON.stringify({ user_id: TARGET, max_level: "standard" }),
      }),
      ctx()
    )
    expect(res.status).toBe(400)
  })

  it("403 when caller is neither tenant-admin nor project-lead", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueAccess({ tenantRole: "member", projectRole: "viewer" })
    const res = await POST(
      new Request("http://t/", {
        method: "POST",
        body: JSON.stringify({ user_id: TARGET, max_level: "confidential" }),
      }),
      ctx()
    )
    expect(res.status).toBe(403)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("201 grants via RPC for a project lead", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueAccess({ tenantRole: "member", projectRole: "lead" })
    rpcMock.mockResolvedValue({
      data: { id: "c1", max_level: "confidential" },
      error: null,
    })
    const res = await POST(
      new Request("http://t/", {
        method: "POST",
        body: JSON.stringify({ user_id: TARGET, max_level: "confidential" }),
      }),
      ctx()
    )
    expect(res.status).toBe(201)
    expect(rpcMock).toHaveBeenCalledWith("grant_confidentiality_clearance", {
      p_project_id: PROJECT,
      p_user_id: TARGET,
      p_max_level: "confidential",
      p_valid_until: null,
    })
  })

  it("403 maps RPC 42501 (DB-layer authority denial)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueAccess({ tenantRole: "admin", projectRole: null })
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "not authorized" },
    })
    const res = await POST(
      new Request("http://t/", {
        method: "POST",
        body: JSON.stringify({ user_id: TARGET, max_level: "strict" }),
      }),
      ctx()
    )
    expect(res.status).toBe(403)
  })

  it("202 pending when a 4-eyes policy gated the level (PROJ-100c)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueAccess({ tenantRole: "admin", projectRole: null })
    // RPC returns null (no error) → a pending approval request was created.
    rpcMock.mockResolvedValue({ data: null, error: null })
    const res = await POST(
      new Request("http://t/", {
        method: "POST",
        body: JSON.stringify({ user_id: TARGET, max_level: "strict" }),
      }),
      ctx()
    )
    expect(res.status).toBe(202)
    expect((await res.json()) as { pending: boolean }).toMatchObject({ pending: true })
  })
})

describe("GET /api/projects/[id]/clearances (list)", () => {
  it("returns clearances for a viewer-accessible project", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    // requireProjectAccess('view') only hits projects
    const proj = newQueryChain()
    proj.maybeSingle.mockResolvedValue({
      data: { id: PROJECT, tenant_id: "t1" },
      error: null,
    })
    enqueue("projects", proj)

    const list = newQueryChain()
    list.order.mockResolvedValue({
      data: [{ id: "c1", user_id: TARGET, max_level: "confidential" }],
      error: null,
    })
    enqueue("ma_confidentiality_clearances", list)

    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(200)
    const json = (await res.json()) as { clearances: unknown[] }
    expect(json.clearances).toHaveLength(1)
  })
})
