import { beforeEach, describe, expect, it, vi } from "vitest"

// -----------------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------------
//
// One chain for INSERT (POST) terminating in .single(),
// one chain for SELECT (GET) which is awaited directly after .limit().
// We swap which chain is returned per test by mutating fromMock's behavior.

const getUserMock = vi.fn()
const rpcMock = vi.fn()

const insertChain = {
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

// The list query is awaited (as a thenable) at .limit(...), so we model it
// as a chain whose terminal call is `.limit()` and we expose a `.then`
// in the final mock implementation. Easier: capture via `.then` on the chain
// object itself.
const listChain: {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  or: ReturnType<typeof vi.fn>
  then: (resolve: (v: unknown) => void) => void
  __result: { data: unknown[] | null; error: { message: string } | null }
} = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  __result: { data: [], error: null },
  then: (resolve) => resolve(listChain.__result),
}

let nextOp: "insert" | "list" = "insert"

const fromMock = vi.fn(() => {
  if (nextOp === "insert") return insertChain
  return listChain
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))

import { GET, POST } from "./route"

// -----------------------------------------------------------------------------

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "22222222-2222-4222-8222-222222222222"
const RESPONSIBLE_ID = "33333333-3333-4333-8333-333333333333"

function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function makeGetRequest(qs: string): Request {
  return new Request(`http://localhost/api/projects?${qs}`, { method: "GET" })
}

beforeEach(() => {
  vi.clearAllMocks()
  nextOp = "insert"
  insertChain.insert.mockReturnValue(insertChain)
  insertChain.select.mockReturnValue(insertChain)
  listChain.select.mockReturnValue(listChain)
  listChain.eq.mockReturnValue(listChain)
  listChain.order.mockReturnValue(listChain)
  listChain.limit.mockReturnValue(listChain)
  listChain.or.mockReturnValue(listChain)
  listChain.__result = { data: [], error: null }
  rpcMock.mockResolvedValue({ data: null, error: null })
})

// -----------------------------------------------------------------------------
// POST
// -----------------------------------------------------------------------------

describe("POST /api/projects", () => {
  it("happy path: creates project and returns 201", async () => {
    nextOp = "insert"
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const created = {
      id: "p1",
      tenant_id: TENANT_ID,
      name: "My project",
      lifecycle_status: "draft",
      project_type: "general",
      created_by: USER_ID,
      responsible_user_id: USER_ID,
      is_deleted: false,
    }
    insertChain.single.mockResolvedValue({ data: created, error: null })

    const res = await POST(
      makePostRequest({ tenant_id: TENANT_ID, name: "My project" })
    )

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({
      project: created,
      applied_default_tags: [],
    })
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        name: "My project",
        project_type: "general",
        created_by: USER_ID,
        responsible_user_id: USER_ID,
      })
    )
  })

  it("defaults responsible_user_id to caller when omitted", async () => {
    nextOp = "insert"
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: { id: "p1" },
      error: null,
    })

    await POST(makePostRequest({ tenant_id: TENANT_ID, name: "X" }))

    const arg = insertChain.insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg.responsible_user_id).toBe(USER_ID)
    expect(arg.created_by).toBe(USER_ID)
  })

  it("uses the provided responsible_user_id when given", async () => {
    nextOp = "insert"
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: { id: "p1" },
      error: null,
    })

    await POST(
      makePostRequest({
        tenant_id: TENANT_ID,
        name: "X",
        responsible_user_id: RESPONSIBLE_ID,
      })
    )

    const arg = insertChain.insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg.responsible_user_id).toBe(RESPONSIBLE_ID)
  })

  it("returns 400 on validation error (missing name)", async () => {
    const res = await POST(makePostRequest({ tenant_id: TENANT_ID }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("validation_error")
  })

  it("returns 400 when planned_end_date precedes planned_start_date", async () => {
    const res = await POST(
      makePostRequest({
        tenant_id: TENANT_ID,
        name: "X",
        planned_start_date: "2026-05-01",
        planned_end_date: "2026-04-01",
      })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe("validation_error")
    expect(body.error.field).toBe("planned_end_date")
  })

  it("returns 400 on non-JSON body", async () => {
    const req = new Request("http://localhost/api/projects", {
      method: "POST",
      body: "{not json",
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("invalid_body")
  })

  it("returns 401 when not signed in", async () => {
    nextOp = "insert"
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(
      makePostRequest({ tenant_id: TENANT_ID, name: "X" })
    )
    expect(res.status).toBe(401)
  })

  it("maps cross-tenant guard (22023) to 422", async () => {
    nextOp = "insert"
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: null,
      error: {
        code: "22023",
        message: "responsible_user_id must be a member of the project tenant",
      },
    })

    const res = await POST(
      makePostRequest({
        tenant_id: TENANT_ID,
        name: "X",
        responsible_user_id: RESPONSIBLE_ID,
      })
    )
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("invalid_parameter")
    expect(body.error.field).toBe("responsible_user_id")
  })

  it("maps RLS denial (42501) to 403", async () => {
    nextOp = "insert"
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied" },
    })

    const res = await POST(
      makePostRequest({ tenant_id: TENANT_ID, name: "X" })
    )
    expect(res.status).toBe(403)
  })

  it("calls bootstrap_project_lead RPC after creating the project", async () => {
    nextOp = "insert"
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: { id: "p1", tenant_id: TENANT_ID },
      error: null,
    })

    const res = await POST(
      makePostRequest({ tenant_id: TENANT_ID, name: "Bootstrap" })
    )

    expect(res.status).toBe(201)
    expect(rpcMock).toHaveBeenCalledWith("bootstrap_project_lead", {
      p_project_id: "p1",
      p_user_id: USER_ID,
    })
  })

  it("returns 500 if bootstrap_project_lead RPC fails", async () => {
    nextOp = "insert"
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: { id: "p1", tenant_id: TENANT_ID },
      error: null,
    })
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "caller is not a member of the project tenant" },
    })

    const res = await POST(
      makePostRequest({ tenant_id: TENANT_ID, name: "X" })
    )
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe("bootstrap_failed")
    expect(body.error.message).toContain("p1")
  })
})

// -----------------------------------------------------------------------------
// GET
// -----------------------------------------------------------------------------

describe("GET /api/projects", () => {
  it("happy path: returns projects list and nextCursor=null when under page size", async () => {
    nextOp = "list"
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    listChain.__result = {
      data: [
        { id: "p1", tenant_id: TENANT_ID, updated_at: "2026-04-25T00:00:00Z" },
        { id: "p2", tenant_id: TENANT_ID, updated_at: "2026-04-24T00:00:00Z" },
      ],
      error: null,
    }

    const res = await GET(makeGetRequest(`tenant_id=${TENANT_ID}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.projects).toHaveLength(2)
    expect(body.nextCursor).toBeNull()
    // Default filter: is_deleted = false
    expect(listChain.eq).toHaveBeenCalledWith("is_deleted", false)
  })

  it("returns include_deleted=true rows when requested", async () => {
    nextOp = "list"
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    listChain.__result = { data: [], error: null }

    await GET(makeGetRequest(`tenant_id=${TENANT_ID}&include_deleted=true`))
    expect(listChain.eq).toHaveBeenCalledWith("is_deleted", true)
  })

  it("applies lifecycle_status / project_type / responsible_user_id filters", async () => {
    nextOp = "list"
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    listChain.__result = { data: [], error: null }

    await GET(
      makeGetRequest(
        `tenant_id=${TENANT_ID}&lifecycle_status=active&project_type=erp&responsible_user_id=${USER_ID}`
      )
    )

    expect(listChain.eq).toHaveBeenCalledWith("lifecycle_status", "active")
    expect(listChain.eq).toHaveBeenCalledWith("project_type", "erp")
    expect(listChain.eq).toHaveBeenCalledWith("responsible_user_id", USER_ID)
  })

  it("emits nextCursor when result count exceeds page size", async () => {
    nextOp = "list"
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    // Page size + 1 rows triggers nextCursor.
    const rows = Array.from({ length: 51 }, (_, i) => ({
      id: `p${i}`,
      updated_at: `2026-04-25T00:00:${String(50 - i).padStart(2, "0")}Z`,
    }))
    listChain.__result = { data: rows, error: null }

    const res = await GET(makeGetRequest(`tenant_id=${TENANT_ID}`))
    const body = await res.json()
    expect(body.projects).toHaveLength(50)
    expect(body.nextCursor).toBeTruthy()
  })

  it("returns 400 when tenant_id is missing", async () => {
    const res = await GET(makeGetRequest(""))
    expect(res.status).toBe(400)
    expect((await res.json()).error.field).toBe("tenant_id")
  })

  it("returns 400 when tenant_id is not a UUID", async () => {
    const res = await GET(makeGetRequest("tenant_id=not-a-uuid"))
    expect(res.status).toBe(400)
  })

  it("returns 400 when lifecycle_status is invalid", async () => {
    const res = await GET(
      makeGetRequest(`tenant_id=${TENANT_ID}&lifecycle_status=foo`)
    )
    expect(res.status).toBe(400)
  })

  it("returns 401 when not signed in", async () => {
    nextOp = "list"
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGetRequest(`tenant_id=${TENANT_ID}`))
    expect(res.status).toBe(401)
  })
})
