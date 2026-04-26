import { beforeEach, describe, expect, it, vi } from "vitest"

// -----------------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------------
//
// Shared queue of "next chain" objects driven per test. Each .from() call
// pulls the next chain from the queue.

const getUserMock = vi.fn()

// Chain factory: returns an object that supports the methods we need.
// The terminal call (.maybeSingle / .single / awaited list) resolves with
// `result`.
type ChainResult = { data: unknown; error: { code?: string; message: string } | null }

interface ChainShape {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  then: (resolve: (v: ChainResult) => void) => void
}

function makeChain(result: ChainResult): ChainShape {
  const chain = {} as ChainShape
  const passthrough = [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "order",
    "limit",
  ] as const
  for (const m of passthrough) {
    chain[m] = vi.fn(() => chain)
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  chain.single = vi.fn().mockResolvedValue(result)
  // For awaited list queries (after .limit / .order)
  chain.then = (resolve) => resolve(result)
  return chain
}

let chainQueue: ChainShape[] = []

const fromMock = vi.fn(() => {
  const next = chainQueue.shift()
  if (!next) throw new Error("No more chains queued for from()")
  return next
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

const adminDeleteChain = makeChain({ data: null, error: null })
const adminFromMock = vi.fn(() => adminDeleteChain)

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: adminFromMock })),
}))

import { DELETE, GET, PATCH } from "./route"

// -----------------------------------------------------------------------------

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "44444444-4444-4444-8444-444444444444"
const USER_ID = "22222222-2222-4222-8222-222222222222"

function makeContext() {
  return { params: Promise.resolve({ id: PROJECT_ID }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  chainQueue = []
})

// -----------------------------------------------------------------------------
// GET
// -----------------------------------------------------------------------------

describe("GET /api/projects/[id]", () => {
  it("happy path: returns project + last 20 events", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const project = {
      id: PROJECT_ID,
      tenant_id: TENANT_ID,
      name: "P",
      lifecycle_status: "draft",
    }
    const events = [
      { id: "e1", from_status: "draft", to_status: "active" },
    ]
    chainQueue.push(makeChain({ data: project, error: null })) // projects.select
    chainQueue.push(makeChain({ data: events, error: null })) // events.select

    const res = await GET(new Request("http://localhost/x"), makeContext())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ project, events })
  })

  it("returns 404 when project missing (RLS hides it)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    chainQueue.push(makeChain({ data: null, error: null }))

    const res = await GET(new Request("http://localhost/x"), makeContext())
    expect(res.status).toBe(404)
  })

  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(new Request("http://localhost/x"), makeContext())
    expect(res.status).toBe(401)
  })

  it("returns 400 when id is not a UUID", async () => {
    const res = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    })
    expect(res.status).toBe(400)
  })

  it("falls back to empty events on event query error", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    chainQueue.push(
      makeChain({ data: { id: PROJECT_ID, name: "P" }, error: null })
    )
    chainQueue.push(makeChain({ data: null, error: { message: "boom" } }))

    const res = await GET(new Request("http://localhost/x"), makeContext())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.events).toEqual([])
  })
})

// -----------------------------------------------------------------------------
// PATCH
// -----------------------------------------------------------------------------

describe("PATCH /api/projects/[id]", () => {
  function makeRequest(body: unknown): Request {
    return new Request("http://localhost/api/projects/x", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  }

  it("happy path: returns updated project", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const updated = { id: PROJECT_ID, name: "Renamed" }
    chainQueue.push(makeChain({ data: updated, error: null }))

    const res = await PATCH(makeRequest({ name: "Renamed" }), makeContext())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ project: updated })
  })

  it("returns 400 on empty body", async () => {
    const res = await PATCH(makeRequest({}), makeContext())
    expect(res.status).toBe(400)
  })

  it("returns 400 when end-date precedes start-date (both provided)", async () => {
    const res = await PATCH(
      makeRequest({
        planned_start_date: "2026-05-01",
        planned_end_date: "2026-04-01",
      }),
      makeContext()
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error.field).toBe("planned_end_date")
  })

  it("accepts is_deleted=false to support restore flow", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const updated = { id: PROJECT_ID, is_deleted: false }
    chainQueue.push(makeChain({ data: updated, error: null }))

    const res = await PATCH(makeRequest({ is_deleted: false }), makeContext())
    expect(res.status).toBe(200)
  })

  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makeRequest({ name: "X" }), makeContext())
    expect(res.status).toBe(401)
  })

  it("maps cross-tenant guard (22023) to 422", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    chainQueue.push(
      makeChain({
        data: null,
        error: { code: "22023", message: "responsible_user_id must be a member" },
      })
    )

    const res = await PATCH(
      makeRequest({ responsible_user_id: PROJECT_ID }),
      makeContext()
    )
    expect(res.status).toBe(422)
    expect((await res.json()).error.field).toBe("responsible_user_id")
  })

  it("returns 404 when project missing", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    chainQueue.push(makeChain({ data: null, error: null }))

    const res = await PATCH(makeRequest({ name: "X" }), makeContext())
    expect(res.status).toBe(404)
  })

  it("rejects forbidden fields (lifecycle_status) silently — only listed fields pass through", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    chainQueue.push(makeChain({ data: { id: PROJECT_ID }, error: null }))

    // The schema strips unknown fields by default in zod object schemas, but
    // since we use refine(...len > 0), at least one *known* field is required.
    // Sending only `lifecycle_status` (not in schema) should fail validation.
    const res = await PATCH(
      makeRequest({ lifecycle_status: "active" }),
      makeContext()
    )
    expect(res.status).toBe(400)
  })
})

// -----------------------------------------------------------------------------
// DELETE
// -----------------------------------------------------------------------------

describe("DELETE /api/projects/[id]", () => {
  function makeRequest(qs = ""): Request {
    return new Request(`http://localhost/api/projects/x${qs}`, {
      method: "DELETE",
    })
  }

  it("soft delete (default): admin/member flips is_deleted, returns 200", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    // Lookup chain
    chainQueue.push(
      makeChain({
        data: { id: PROJECT_ID, tenant_id: TENANT_ID, is_deleted: false },
        error: null,
      })
    )
    // Soft-delete update chain
    chainQueue.push(makeChain({ data: { id: PROJECT_ID }, error: null }))

    const res = await DELETE(makeRequest(), makeContext())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it("hard delete: admin path runs, calls service-role client, returns 200", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    // Lookup
    chainQueue.push(
      makeChain({
        data: { id: PROJECT_ID, tenant_id: TENANT_ID, is_deleted: true },
        error: null,
      })
    )
    // requireTenantAdmin pre-check (membership query)
    chainQueue.push(makeChain({ data: { role: "admin" }, error: null }))
    // adminDeleteChain is consumed via createAdminClient mock

    const res = await DELETE(makeRequest("?hard=true"), makeContext())
    expect(res.status).toBe(200)
    expect(adminFromMock).toHaveBeenCalledWith("projects")
    expect(adminDeleteChain.delete).toHaveBeenCalled()
  })

  it("hard delete by member: 403 (admin pre-check rejects)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    // Lookup
    chainQueue.push(
      makeChain({
        data: { id: PROJECT_ID, tenant_id: TENANT_ID, is_deleted: false },
        error: null,
      })
    )
    // Pre-check: caller is a member (not admin)
    chainQueue.push(makeChain({ data: { role: "member" }, error: null }))

    const res = await DELETE(makeRequest("?hard=true"), makeContext())
    expect(res.status).toBe(403)
    expect(adminDeleteChain.delete).not.toHaveBeenCalled()
  })

  it("hard delete by non-member: 403", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    chainQueue.push(
      makeChain({
        data: { id: PROJECT_ID, tenant_id: TENANT_ID, is_deleted: false },
        error: null,
      })
    )
    chainQueue.push(makeChain({ data: null, error: null }))

    const res = await DELETE(makeRequest("?hard=true"), makeContext())
    expect(res.status).toBe(403)
  })

  it("returns 404 when project missing", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    chainQueue.push(makeChain({ data: null, error: null }))

    const res = await DELETE(makeRequest(), makeContext())
    expect(res.status).toBe(404)
  })

  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeRequest(), makeContext())
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid id", async () => {
    const res = await DELETE(makeRequest(), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    })
    expect(res.status).toBe(400)
  })
})
