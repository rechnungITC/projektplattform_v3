import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-20 — collection endpoint tests for /api/projects/[id]/risks.

const getUserMock = vi.fn()

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
  limit: ReturnType<typeof vi.fn>
  then: (resolve: (v: unknown) => void) => void
  __result: { data: unknown[] | null; error: { message: string } | null }
} = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  __result: { data: [], error: null },
  then: (resolve) => resolve(listChain.__result),
}

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "project_memberships") return projectMembershipChain
  if (table === "risks") return Object.assign({}, insertChain, listChain)
  if (table === "tenant_settings") {
    const chain: { select: unknown; eq: unknown; maybeSingle: unknown } = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
    }
    return chain
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
  return new Request(`http://localhost/api/projects/${PROJECT_ID}/risks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
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

describe("POST /api/projects/[id]/risks", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePost({ title: "X", probability: 3, impact: 3 }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 400 on validation error (probability out of range)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(
      makePost({ title: "X", probability: 9, impact: 3 }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 when title is missing", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(makePost({ probability: 3, impact: 3 }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(400)
  })

  it("creates risk on valid input (201)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: {
        id: "r1",
        tenant_id: TENANT_ID,
        project_id: PROJECT_ID,
        title: "Schedule slip",
        probability: 3,
        impact: 4,
        score: 12,
        status: "open",
      },
      error: null,
    })
    const res = await POST(
      makePost({
        title: "Schedule slip",
        probability: 3,
        impact: 4,
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { risk: { id: string; score: number } }
    expect(body.risk.id).toBe("r1")
    expect(body.risk.score).toBe(12)
  })

  it("returns 403 when RLS blocks (Postgres 42501)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    })
    projectMembershipChain.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    })
    const res = await POST(
      makePost({ title: "X", probability: 3, impact: 3 }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(403)
  })
})

describe("GET /api/projects/[id]/risks", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/risks`),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(401)
  })

  it("returns 200 with risks list", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    listChain.__result = {
      data: [
        {
          id: "r1",
          tenant_id: TENANT_ID,
          project_id: PROJECT_ID,
          title: "Test",
          probability: 3,
          impact: 3,
          score: 9,
          status: "open",
        },
      ],
      error: null,
    }
    const res = await GET(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/risks`),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { risks: unknown[] }
    expect(body.risks).toHaveLength(1)
  })

  it("filters by status when query param is valid", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    listChain.__result = { data: [], error: null }
    const res = await GET(
      new Request(
        `http://localhost/api/projects/${PROJECT_ID}/risks?status=closed`
      ),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(200)
    expect(listChain.eq).toHaveBeenCalledWith("status", "closed")
  })
})
