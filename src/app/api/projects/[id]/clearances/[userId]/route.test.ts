import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()
const rpcMock = vi.fn()

interface QueryChain {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}
function newQueryChain(): QueryChain {
  const chain = {} as QueryChain
  chain.select = vi.fn().mockReturnValue(chain)
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
    rpc: rpcMock,
  })),
}))

import { DELETE } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const TARGET = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function ctx() {
  return { params: Promise.resolve({ id: PROJECT, userId: TARGET }) }
}

function queueAccess(opts: { tenantRole?: string | null; projectRole?: string | null }) {
  const proj = newQueryChain()
  proj.maybeSingle.mockResolvedValue({ data: { id: PROJECT, tenant_id: "t1" }, error: null })
  enqueue("projects", proj)
  const tm = newQueryChain()
  tm.maybeSingle.mockResolvedValue({ data: opts.tenantRole ? { role: opts.tenantRole } : null, error: null })
  enqueue("tenant_memberships", tm)
  const pm = newQueryChain()
  pm.maybeSingle.mockResolvedValue({ data: opts.projectRole ? { role: opts.projectRole } : null, error: null })
  enqueue("project_memberships", pm)
}

beforeEach(() => {
  queue.length = 0
  getUserMock.mockReset()
  rpcMock.mockReset()
  fromMock.mockClear()
})

describe("DELETE /api/projects/[id]/clearances/[userId] (revoke)", () => {
  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(new Request("http://t/", { method: "DELETE" }), ctx())
    expect(res.status).toBe(401)
  })

  it("400 on invalid user id", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    const res = await DELETE(new Request("http://t/", { method: "DELETE" }), {
      params: Promise.resolve({ id: PROJECT, userId: "not-a-uuid" }),
    })
    expect(res.status).toBe(400)
  })

  it("403 when caller lacks authority", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueAccess({ tenantRole: "member", projectRole: null })
    const res = await DELETE(new Request("http://t/", { method: "DELETE" }), ctx())
    expect(res.status).toBe(403)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("200 revokes via RPC for a tenant admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueAccess({ tenantRole: "admin", projectRole: null })
    rpcMock.mockResolvedValue({ data: null, error: null })
    const res = await DELETE(new Request("http://t/", { method: "DELETE" }), ctx())
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("revoke_confidentiality_clearance", {
      p_project_id: PROJECT,
      p_user_id: TARGET,
    })
  })
})
