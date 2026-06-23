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

import { GET } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const ME = "cccccccc-3333-4333-8333-cccccccccccc"

function ctx() {
  return { params: Promise.resolve({ id: PROJECT }) }
}
function queueProjectView() {
  const proj = newQueryChain()
  proj.maybeSingle.mockResolvedValue({
    data: { id: PROJECT, tenant_id: "t1" },
    error: null,
  })
  enqueue("projects", proj)
}
function get(qs = "") {
  return GET(new Request(`http://t/access-overview${qs}`), ctx())
}

beforeEach(() => {
  queue.length = 0
  getUserMock.mockReset()
  rpcMock.mockReset()
  fromMock.mockClear()
})

describe("GET /api/projects/[id]/access-overview", () => {
  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await get()).status).toBe(401)
  })

  it("400 on an invalid objectType", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    expect((await get("?objectType=bogus")).status).toBe(400)
  })

  it("returns the gate-derived overview for the project object (default)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    const obj = newQueryChain()
    obj.maybeSingle.mockResolvedValue({
      data: { confidentiality_level: "confidential" },
      error: null,
    })
    enqueue("projects", obj)
    rpcMock.mockResolvedValue({
      data: [
        { user_id: "u1", access_reason: "admin", cleared_level: null, valid_until: null },
        { user_id: "u2", access_reason: "clearance", cleared_level: "confidential", valid_until: null },
      ],
      error: null,
    })
    const res = await get()
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      confidentiality_level: string
      entries: unknown[]
    }
    expect(json.confidentiality_level).toBe("confidential")
    expect(json.entries).toHaveLength(2)
    expect(rpcMock).toHaveBeenCalledWith("who_can_access", {
      p_project_id: PROJECT,
      p_level: "confidential",
    })
  })

  it("404 when the target object is not visible", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    const obj = newQueryChain()
    obj.maybeSingle.mockResolvedValue({ data: null, error: null })
    enqueue("phases", obj)
    expect(
      (await get("?objectType=phase&objectId=eeeeeeee-5555-4555-8555-eeeeeeeeeeee")).status
    ).toBe(404)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("403 maps RPC 42501 (non-manager)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    const obj = newQueryChain()
    obj.maybeSingle.mockResolvedValue({
      data: { confidentiality_level: "strict" },
      error: null,
    })
    enqueue("projects", obj)
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "not authorized" },
    })
    expect((await get()).status).toBe(403)
  })
})
