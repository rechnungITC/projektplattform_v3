import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-65 ε.1 — Goals collection route tests.

const { getUserMock } = vi.hoisted(() => ({ getUserMock: vi.fn() }))

interface Chain {
  select?: ReturnType<typeof vi.fn>
  insert?: ReturnType<typeof vi.fn>
  eq?: ReturnType<typeof vi.fn>
  is?: ReturnType<typeof vi.fn>
  order?: ReturnType<typeof vi.fn>
  limit?: ReturnType<typeof vi.fn>
  single?: ReturnType<typeof vi.fn>
  maybeSingle?: ReturnType<typeof vi.fn>
  then?: ReturnType<typeof vi.fn>
}

const chains: Record<string, Chain[]> = {}
function enqueue(table: string, chain: Chain) {
  ;(chains[table] ??= []).push(chain)
}

const fromMock = vi.fn((table: string) => {
  const next = chains[table]?.shift()
  if (!next) throw new Error(`unexpected/exhausted chain for ${table}`)
  return next
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { GET, POST } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"

function makeReq(method: "GET" | "POST", query = "", body?: unknown): Request {
  return new Request(`http://localhost/api/projects/${PROJECT_ID}/goals${query}`, {
    method,
    ...(method === "POST"
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body ?? {}),
        }
      : {}),
  })
}

function enqueueAccess({ action = "view" as "view" | "edit" } = {}) {
  enqueue("projects", {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: { id: PROJECT_ID, tenant_id: TENANT_ID }, error: null }),
  })
  enqueue("tenant_memberships", {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { role: "admin" }, error: null }),
  })
  if (action === "edit") {
    enqueue("project_memberships", {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(chains)) delete chains[k]
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
})

describe("GET /api/projects/[id]/goals", () => {
  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeReq("GET"), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 200 with empty list", async () => {
    enqueueAccess()
    const thenable = {
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        resolve({ data: [], error: null }),
    }
    enqueue("project_goals", {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnValue(thenable),
    })
    const res = await GET(makeReq("GET"), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.goals).toEqual([])
  })
})

describe("POST /api/projects/[id]/goals", () => {
  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeReq("POST", "", { title: "X" }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 400 when title missing", async () => {
    enqueueAccess({ action: "edit" })
    const res = await POST(makeReq("POST", "", {}), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(400)
  })

  it("creates a goal with title only (defaults applied)", async () => {
    enqueueAccess({ action: "edit" })
    const insertMock = vi.fn().mockReturnThis()
    enqueue("project_goals", {
      insert: insertMock,
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "g-1",
          tenant_id: TENANT_ID,
          project_id: PROJECT_ID,
          title: "Launch",
          status: "draft",
          sort_order: 0,
          created_by: USER_ID,
        },
        error: null,
      }),
    })

    const res = await POST(makeReq("POST", "", { title: "Launch" }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(201)
    const arg = insertMock.mock.calls[0][0] as Record<string, unknown>
    expect(arg.title).toBe("Launch")
    expect(arg.status).toBe("draft")
    expect(arg.tenant_id).toBe(TENANT_ID)
    expect(arg.project_id).toBe(PROJECT_ID)
    expect(arg.created_by).toBe(USER_ID)
  })
})
