import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-95 (AC-95-1) — POST /api/projects/[id]/phase-model/activate.
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

function ctx(id: string = PROJECT) {
  return { params: Promise.resolve({ id }) }
}
function req() {
  return new Request("http://t/", { method: "POST" })
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

describe("POST /api/projects/[id]/phase-model/activate", () => {
  it("400 on invalid project id", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    const res = await POST(req(), ctx("not-a-uuid"))
    expect(res.status).toBe(400)
  })

  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(req(), ctx())
    expect(res.status).toBe(401)
  })

  it("200 returns the seed result for an authorized caller", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    rpcMock.mockResolvedValue({
      data: { seeded: 9, phase2_locked: true, mandate_status: "draft" },
      error: null,
    })
    const res = await POST(req(), ctx())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      seeded: 9,
      phase2_locked: true,
      mandate_status: "draft",
    })
    expect(rpcMock).toHaveBeenCalledWith("activate_ma_phase_model", {
      p_project_id: PROJECT,
    })
  })

  it("403 maps the RPC authority denial (42501)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "insufficient role" },
    })
    const res = await POST(req(), ctx())
    expect(res.status).toBe(403)
  })

  it("422 maps a non-M&A project (22023)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "22023", message: "only for M&A projects" },
    })
    const res = await POST(req(), ctx())
    expect(res.status).toBe(422)
  })

  it("404 maps a missing project (02000)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueViewAccess()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "02000", message: "project not found" },
    })
    const res = await POST(req(), ctx())
    expect(res.status).toBe(404)
  })
})
