import { beforeEach, describe, expect, it, vi } from "vitest"

// -----------------------------------------------------------------------------
// Mocks: model the multiple from() chains the route now triggers
// 1. requireProjectAccess: from("projects").select().eq().eq().maybeSingle()
// 2. requireProjectAccess: from("tenant_memberships").select().eq().eq().maybeSingle()
//    (parallel) from("project_memberships").select().eq().eq().maybeSingle()
// 3. INSERT: from("project_memberships").insert().select().single()
//
// We track the sequence of from()-calls so each one returns its own chain.

const getUserMock = vi.fn()

interface QueryChain {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
}

function newQueryChain(): QueryChain {
  const chain = {} as QueryChain
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
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
  if (!next) {
    throw new Error(`Unexpected from('${table}') — queue empty`)
  }
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

import { POST } from "./route"

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const TENANT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const TARGET_USER_ID = "44444444-4444-4444-8444-444444444444"

function makePostRequest(body: unknown, projectId = PROJECT_ID) {
  return new Request(`http://localhost/api/projects/${projectId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function makeContext(projectId = PROJECT_ID) {
  return { params: Promise.resolve({ id: projectId }) }
}

/**
 * Set up the three query chains requireProjectAccess(...) needs.
 *
 *   - tenantRole: 'admin' | 'member' | null
 *   - projectRole: 'lead' | 'editor' | 'viewer' | null
 *   - projectExists: when false, the projects lookup returns null → 404
 */
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

describe("POST /api/projects/[id]/members", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(
      makePostRequest({ user_id: TARGET_USER_ID, role: "editor" }),
      makeContext()
    )
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid project id", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(
      makePostRequest({ user_id: TARGET_USER_ID, role: "editor" }, "bad-id"),
      makeContext("bad-id")
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 on validation error (bad role)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(
      makePostRequest({ user_id: TARGET_USER_ID, role: "owner" }),
      makeContext()
    )
    expect(res.status).toBe(400)
  })

  it("returns 404 when project lookup yields no row (RLS or non-existent)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setupAccessChains({ projectExists: false })

    const res = await POST(
      makePostRequest({ user_id: TARGET_USER_ID, role: "editor" }),
      makeContext()
    )
    expect(res.status).toBe(404)
  })

  it("returns 403 with clean copy when caller is not lead/admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setupAccessChains({ tenantRole: "member", projectRole: "editor" })

    const res = await POST(
      makePostRequest({ user_id: TARGET_USER_ID, role: "viewer" }),
      makeContext()
    )
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe("forbidden")
    expect(body.error.message).toContain("project leads")
  })

  it("happy path: tenant_admin can add a member", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setupAccessChains({ tenantRole: "admin", projectRole: null })

    const insertChain = newQueryChain()
    insertChain.single.mockResolvedValue({
      data: {
        id: "m1",
        project_id: PROJECT_ID,
        user_id: TARGET_USER_ID,
        role: "editor",
      },
      error: null,
    })
    enqueue("project_memberships", insertChain)

    const res = await POST(
      makePostRequest({ user_id: TARGET_USER_ID, role: "editor" }),
      makeContext()
    )
    expect(res.status).toBe(201)
    expect(insertChain.insert).toHaveBeenCalledWith({
      project_id: PROJECT_ID,
      user_id: TARGET_USER_ID,
      role: "editor",
      created_by: USER_ID,
    })
  })

  it("happy path: project_lead (non-admin) can add a member", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setupAccessChains({ tenantRole: "member", projectRole: "lead" })

    const insertChain = newQueryChain()
    insertChain.single.mockResolvedValue({
      data: { id: "m1" },
      error: null,
    })
    enqueue("project_memberships", insertChain)

    const res = await POST(
      makePostRequest({ user_id: TARGET_USER_ID, role: "viewer" }),
      makeContext()
    )
    expect(res.status).toBe(201)
  })

  it("maps cross-tenant guard (22023) to 422", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setupAccessChains({ tenantRole: "admin" })

    const insertChain = newQueryChain()
    insertChain.single.mockResolvedValue({
      data: null,
      error: { code: "22023", message: "user_id must be in project tenant" },
    })
    enqueue("project_memberships", insertChain)

    const res = await POST(
      makePostRequest({ user_id: TARGET_USER_ID, role: "viewer" }),
      makeContext()
    )
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe("invalid_parameter")
  })

  it("maps unique violation (23505) to 409", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    setupAccessChains({ tenantRole: "admin" })

    const insertChain = newQueryChain()
    insertChain.single.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    })
    enqueue("project_memberships", insertChain)

    const res = await POST(
      makePostRequest({ user_id: TARGET_USER_ID, role: "viewer" }),
      makeContext()
    )
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe("already_member")
  })
})
