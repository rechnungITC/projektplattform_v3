import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-8 — collection endpoint tests for /api/projects/[id]/stakeholders.

const getUserMock = vi.fn()

// Project access lookup chain (used by requireProjectAccess + tenant_membership/project_membership lookups inside it)
const projectChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const tenantMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const projectMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const insertChain = {
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

const listChain: {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  then: (resolve: (v: unknown) => void) => void
  __result: { data: unknown[] | null; error: { message: string } | null }
} = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  __result: { data: [], error: null },
  then: (resolve) => resolve(listChain.__result),
}

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "project_memberships") return projectMembershipChain
  if (table === "stakeholders") {
    // Subsequent .insert() vs .select() resolves at runtime; we expose both.
    return Object.assign({}, insertChain, listChain)
  }
  throw new Error(`unexpected table ${table}`)
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

function makePost(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/stakeholders`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  projectChain.select.mockReturnValue(projectChain)
  projectChain.eq.mockReturnValue(projectChain)
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  projectMembershipChain.select.mockReturnValue(projectMembershipChain)
  projectMembershipChain.eq.mockReturnValue(projectMembershipChain)
  insertChain.insert.mockReturnValue(insertChain)
  insertChain.select.mockReturnValue(insertChain)
  listChain.__result = { data: [], error: null }

  // Default: project exists and lookups succeed
  projectChain.maybeSingle.mockResolvedValue({
    data: { id: PROJECT_ID, tenant_id: TENANT_ID },
    error: null,
  })
  tenantMembershipChain.maybeSingle.mockResolvedValue({
    data: { role: "admin" },
    error: null,
  })
  projectMembershipChain.maybeSingle.mockResolvedValue({
    data: null,
    error: null,
  })
})

describe("POST /api/projects/[id]/stakeholders", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(
      makePost({ kind: "person", origin: "internal", name: "Alice" }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(401)
  })

  it("returns 400 on validation error", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(
      makePost({ kind: "invalid", origin: "internal", name: "Alice" }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it("returns 404 when project doesn't exist (RLS hides it)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    projectChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    const res = await POST(
      makePost({ kind: "person", origin: "internal", name: "Alice" }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(404)
  })

  it("creates a stakeholder happy path", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const created = {
      id: "s1",
      project_id: PROJECT_ID,
      tenant_id: TENANT_ID,
      kind: "person",
      origin: "internal",
      name: "Alice",
      role_key: "sponsor",
      influence: "high",
      impact: "medium",
      is_active: true,
    }
    insertChain.single.mockResolvedValue({ data: created, error: null })
    const res = await POST(
      makePost({
        kind: "person",
        origin: "internal",
        name: "  Alice  ",
        role_key: "sponsor",
        influence: "high",
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { stakeholder: { id: string } }
    expect(body.stakeholder.id).toBe("s1")
    const arg = insertChain.insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg.name).toBe("Alice")
    expect(arg.tenant_id).toBe(TENANT_ID)
    expect(arg.created_by).toBe(USER_ID)
  })

  it("returns 403 when caller lacks edit access", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    // Tenant member but not admin AND no project membership
    tenantMembershipChain.maybeSingle.mockResolvedValueOnce({
      data: { role: "member" },
      error: null,
    })
    projectMembershipChain.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    })
    const res = await POST(
      makePost({ kind: "person", origin: "internal", name: "Alice" }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(403)
  })
})

describe("GET /api/projects/[id]/stakeholders", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(
      new Request(
        `http://localhost/api/projects/${PROJECT_ID}/stakeholders`,
        { method: "GET" }
      ),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(401)
  })

  it("filters out inactive by default", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    listChain.__result = { data: [], error: null }
    await GET(
      new Request(
        `http://localhost/api/projects/${PROJECT_ID}/stakeholders`,
        { method: "GET" }
      ),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(listChain.eq).toHaveBeenCalledWith("is_active", true)
  })

  it("includes inactive when ?include_inactive=true", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    listChain.__result = { data: [], error: null }
    await GET(
      new Request(
        `http://localhost/api/projects/${PROJECT_ID}/stakeholders?include_inactive=true`,
        { method: "GET" }
      ),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    // is_active filter must NOT be applied
    const isActiveCalls = listChain.eq.mock.calls.filter(
      (call) => call[0] === "is_active"
    )
    expect(isActiveCalls.length).toBe(0)
  })
})
