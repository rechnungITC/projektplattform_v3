import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-94 — GET/PATCH /api/projects/[id]/ma-profile.
// Mocks model the from()-chains requireProjectAccess triggers plus the
// ma_project_profiles select/update chains.
const getUserMock = vi.fn()

interface QueryChain {
  select: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}

function newQueryChain(): QueryChain {
  const chain = {} as QueryChain
  chain.select = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
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
  })),
}))

import { GET, PATCH } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const SPONSOR = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}

function queueAccess(opts: {
  tenantRole?: string | null
  projectRole?: string | null
}) {
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

function queueViewAccess() {
  const proj = newQueryChain()
  proj.maybeSingle.mockResolvedValue({
    data: { id: PROJECT, tenant_id: "t1" },
    error: null,
  })
  enqueue("projects", proj)
}

beforeEach(() => {
  queue.length = 0
  getUserMock.mockReset()
  fromMock.mockClear()
})

describe("GET /api/projects/[id]/ma-profile", () => {
  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(401)
  })

  it("400 on invalid project id", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    const res = await GET(new Request("http://t/"), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    })
    expect(res.status).toBe(400)
  })

  it("404 when no profile row (or hidden by need-to-know)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    const prof = newQueryChain()
    prof.maybeSingle.mockResolvedValue({ data: null, error: null })
    enqueue("ma_project_profiles", prof)
    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(404)
  })

  it("200 returns the profile for a viewer", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    const prof = newQueryChain()
    prof.maybeSingle.mockResolvedValue({
      data: { id: "p1", project_id: PROJECT, mandate_status: "draft" },
      error: null,
    })
    enqueue("ma_project_profiles", prof)
    const res = await GET(new Request("http://t/"), ctx())
    expect(res.status).toBe(200)
    const json = (await res.json()) as { profile: { mandate_status: string } }
    expect(json.profile.mandate_status).toBe("draft")
  })
})

describe("PATCH /api/projects/[id]/ma-profile", () => {
  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(
      new Request("http://t/", {
        method: "PATCH",
        body: JSON.stringify({ deal_rationale: "x" }),
      }),
      ctx()
    )
    expect(res.status).toBe(401)
  })

  it("400 on empty patch (no fields)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    const res = await PATCH(
      new Request("http://t/", { method: "PATCH", body: JSON.stringify({}) }),
      ctx()
    )
    expect(res.status).toBe(400)
  })

  it("400 on invalid sponsor uuid", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    const res = await PATCH(
      new Request("http://t/", {
        method: "PATCH",
        body: JSON.stringify({ sponsor_user_id: "nope" }),
      }),
      ctx()
    )
    expect(res.status).toBe(400)
  })

  it("403 when caller lacks edit role", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueAccess({ tenantRole: "member", projectRole: "viewer" })
    const res = await PATCH(
      new Request("http://t/", {
        method: "PATCH",
        body: JSON.stringify({ deal_rationale: "Konsolidierung" }),
      }),
      ctx()
    )
    expect(res.status).toBe(403)
  })

  it("200 updates strategic fields for an editor", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueAccess({ tenantRole: "member", projectRole: "editor" })
    const upd = newQueryChain()
    upd.maybeSingle.mockResolvedValue({
      data: { id: "p1", project_id: PROJECT, deal_rationale: "Konsolidierung" },
      error: null,
    })
    enqueue("ma_project_profiles", upd)
    const res = await PATCH(
      new Request("http://t/", {
        method: "PATCH",
        body: JSON.stringify({
          deal_rationale: "Konsolidierung",
          sponsor_user_id: SPONSOR,
        }),
      }),
      ctx()
    )
    expect(res.status).toBe(200)
    expect(upd.update).toHaveBeenCalledWith({
      deal_rationale: "Konsolidierung",
      sponsor_user_id: SPONSOR,
    })
  })

  it("403 maps a DB-layer 42501 (need-to-know denial)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueAccess({ tenantRole: "admin", projectRole: null })
    const upd = newQueryChain()
    upd.maybeSingle.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "rls" },
    })
    enqueue("ma_project_profiles", upd)
    const res = await PATCH(
      new Request("http://t/", {
        method: "PATCH",
        body: JSON.stringify({ confidentiality_level: "strict" }),
      }),
      ctx()
    )
    expect(res.status).toBe(403)
  })
})
