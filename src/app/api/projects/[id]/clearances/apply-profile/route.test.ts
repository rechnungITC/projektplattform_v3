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

import { POST } from "./route"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const TARGET = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const PROFILE = "dddddddd-4444-4444-8444-dddddddddddd"
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

describe("POST /api/projects/[id]/clearances/apply-profile", () => {
  it("401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    expect((await post({ user_id: TARGET, profile_id: PROFILE })).status).toBe(401)
  })

  it("400 on invalid body (missing profile_id)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    expect((await post({ user_id: TARGET })).status).toBe(400)
  })

  it("404 when the project is not visible", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    const proj = newQueryChain()
    proj.maybeSingle.mockResolvedValue({ data: null, error: null })
    enqueue("projects", proj)
    expect((await post({ user_id: TARGET, profile_id: PROFILE })).status).toBe(404)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it("201 applies the profile via the RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: { id: "c1", max_level: "confidential", applied_profile_id: PROFILE },
      error: null,
    })
    const res = await post({ user_id: TARGET, profile_id: PROFILE })
    expect(res.status).toBe(201)
    expect(rpcMock).toHaveBeenCalledWith("apply_clearance_profile", {
      p_project_id: PROJECT,
      p_user_id: TARGET,
      p_profile_id: PROFILE,
    })
  })

  it("403 maps RPC 42501 (authority denial)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "not authorized" },
    })
    expect((await post({ user_id: TARGET, profile_id: PROFILE })).status).toBe(403)
  })

  it("404 maps RPC P0002 (profile not found or inactive)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "clearance profile not found or inactive" },
    })
    expect((await post({ user_id: TARGET, profile_id: PROFILE })).status).toBe(404)
  })

  it("202 pending when a 4-eyes policy gated the level (PROJ-100c)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: ME } } })
    queueProjectView()
    // RPC returns null (no error) → a pending approval request was created.
    rpcMock.mockResolvedValue({ data: null, error: null })
    const res = await post({ user_id: TARGET, profile_id: PROFILE })
    expect(res.status).toBe(202)
    expect((await res.json()) as { pending: boolean }).toMatchObject({ pending: true })
  })
})
