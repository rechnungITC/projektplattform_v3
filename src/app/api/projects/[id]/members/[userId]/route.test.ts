import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()

interface QueryChain {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  __terminal?: { data: unknown; error: unknown }
  then?: (resolve: (v: unknown) => void) => void
}

function newQueryChain(): QueryChain {
  const chain = {} as QueryChain
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.maybeSingle = vi.fn()
  chain.single = vi.fn()
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
    throw new Error(
      `Expected from('${next.table}') but got from('${table}')`
    )
  }
  return next.chain
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { DELETE, PATCH } from "./route"

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const TENANT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const TARGET_USER_ID = "44444444-4444-4444-8444-444444444444"

function makePatchRequest(body: unknown) {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/members/${TARGET_USER_ID}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }
  )
}

function makeDeleteRequest() {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/members/${TARGET_USER_ID}`,
    { method: "DELETE" }
  )
}

function makeContext() {
  return {
    params: Promise.resolve({ id: PROJECT_ID, userId: TARGET_USER_ID }),
  }
}

function setupAccessChains(opts: {
  projectExists?: boolean
  tenantRole?: "admin" | "member" | null
  projectRole?: "lead" | "editor" | "viewer" | null
}) {
  const projectChain = newQueryChain()
  projectChain.maybeSingle.mockResolvedValue({
    data:
      opts.projectExists === false
        ? null
        : { id: PROJECT_ID, tenant_id: TENANT_ID },
    error: null,
  })
  enqueue("projects", projectChain)

  if (opts.projectExists === false) return

  const tenantChain = newQueryChain()
  tenantChain.maybeSingle.mockResolvedValue({
    data: opts.tenantRole ? { role: opts.tenantRole } : null,
    error: null,
  })
  enqueue("tenant_memberships", tenantChain)

  const projectMembershipChain = newQueryChain()
  projectMembershipChain.maybeSingle.mockResolvedValue({
    data: opts.projectRole ? { role: opts.projectRole } : null,
    error: null,
  })
  enqueue("project_memberships", projectMembershipChain)
}

beforeEach(() => {
  vi.clearAllMocks()
  queue.length = 0
})

describe("PATCH /api/projects/[id]/members/[userId]", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makePatchRequest({ role: "viewer" }), makeContext())
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid role", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PATCH(
      makePatchRequest({ role: "owner" }),
      makeContext()
    )
    expect(res.status).toBe(400)
  })

  it("returns 404 when project not found / RLS hidden", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setupAccessChains({ projectExists: false })

    const res = await PATCH(makePatchRequest({ role: "viewer" }), makeContext())
    expect(res.status).toBe(404)
  })

  it("returns 403 when caller is editor (cannot manage members)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setupAccessChains({ tenantRole: "member", projectRole: "editor" })

    const res = await PATCH(makePatchRequest({ role: "viewer" }), makeContext())
    expect(res.status).toBe(403)
  })

  it("happy path: project_lead changes a member's role", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setupAccessChains({ tenantRole: "member", projectRole: "lead" })

    const updateChain = newQueryChain()
    updateChain.single.mockResolvedValue({
      data: {
        id: "m1",
        project_id: PROJECT_ID,
        user_id: TARGET_USER_ID,
        role: "viewer",
      },
      error: null,
    })
    enqueue("project_memberships", updateChain)

    const res = await PATCH(
      makePatchRequest({ role: "viewer" }),
      makeContext()
    )
    expect(res.status).toBe(200)
    expect(updateChain.update).toHaveBeenCalledWith({ role: "viewer" })
  })

  it("maps last-lead trigger (check_violation) to 422", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setupAccessChains({ tenantRole: "admin" })

    const updateChain = newQueryChain()
    updateChain.single.mockResolvedValue({
      data: null,
      error: {
        code: "check_violation",
        message: "cannot demote the last lead",
      },
    })
    enqueue("project_memberships", updateChain)

    const res = await PATCH(
      makePatchRequest({ role: "viewer" }),
      makeContext()
    )
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe("last_lead")
  })
})

describe("DELETE /api/projects/[id]/members/[userId]", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeDeleteRequest(), makeContext())
    expect(res.status).toBe(401)
  })

  it("returns 404 when project not found", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setupAccessChains({ projectExists: false })
    const res = await DELETE(makeDeleteRequest(), makeContext())
    expect(res.status).toBe(404)
  })

  it("returns 403 when caller is viewer", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setupAccessChains({ tenantRole: "member", projectRole: "viewer" })
    const res = await DELETE(makeDeleteRequest(), makeContext())
    expect(res.status).toBe(403)
  })

  it("happy path: project_lead deletes a member", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setupAccessChains({ tenantRole: "member", projectRole: "lead" })

    // The DELETE chain ends in `.eq().eq()` with the result awaited as a
    // thenable. Modeling it as a chain whose terminal eq() resolves.
    const deleteChain = newQueryChain()
    let eqCalls = 0
    deleteChain.eq.mockImplementation(() => {
      eqCalls += 1
      if (eqCalls === 2) {
        return Promise.resolve({ error: null })
      }
      return deleteChain
    })
    enqueue("project_memberships", deleteChain)

    const res = await DELETE(makeDeleteRequest(), makeContext())
    expect(res.status).toBe(204)
  })
})
