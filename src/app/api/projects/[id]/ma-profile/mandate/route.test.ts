import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-94 (AC-4) — POST /api/projects/[id]/ma-profile/mandate.
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

import { POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
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
  rpcMock.mockReset()
  fromMock.mockClear()
})

describe("POST /api/projects/[id]/ma-profile/mandate", () => {
  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(
      new Request("http://t/", {
        method: "POST",
        body: JSON.stringify({ to_status: "submitted" }),
      }),
      ctx()
    )
    expect(res.status).toBe(401)
  })

  it("400 on invalid to_status", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    const res = await POST(
      new Request("http://t/", {
        method: "POST",
        body: JSON.stringify({ to_status: "bogus" }),
      }),
      ctx()
    )
    expect(res.status).toBe(400)
  })

  it("403 maps RPC authority or clearance denial after project visibility check", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "insufficient role" },
    })
    const res = await POST(
      new Request("http://t/", {
        method: "POST",
        body: JSON.stringify({ to_status: "approved" }),
      }),
      ctx()
    )
    expect(res.status).toBe(403)
    expect(rpcMock).toHaveBeenCalledWith("transition_mandate_status", {
      p_project_id: PROJECT,
      p_to_status: "approved",
    })
  })

  it("200 returns the RPC transition result for an authorized caller", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    rpcMock.mockResolvedValue({
      data: { project_id: PROJECT, mandate_status: "submitted", from_status: "draft" },
      error: null,
    })
    const res = await POST(
      new Request("http://t/", {
        method: "POST",
        body: JSON.stringify({ to_status: "submitted" }),
      }),
      ctx()
    )
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("transition_mandate_status", {
      p_project_id: PROJECT,
      p_to_status: "submitted",
    })
  })

  it("422 maps an invalid transition (RPC 23514)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "mandate already approved (terminal)" },
    })
    const res = await POST(
      new Request("http://t/", {
        method: "POST",
        body: JSON.stringify({ to_status: "draft" }),
      }),
      ctx()
    )
    expect(res.status).toBe(422)
  })

  it("403 maps a DB-layer authority denial (RPC 42501)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "insufficient role" },
    })
    const res = await POST(
      new Request("http://t/", {
        method: "POST",
        body: JSON.stringify({ to_status: "approved" }),
      }),
      ctx()
    )
    expect(res.status).toBe(403)
  })
})
