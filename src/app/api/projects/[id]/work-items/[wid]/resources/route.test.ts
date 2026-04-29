import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-11 — allocation join endpoint tests.

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
const workItemChain = {
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
  if (table === "work_items") return workItemChain
  if (table === "work_item_resources")
    return Object.assign({}, insertChain, listChain)
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
const WORK_ITEM_ID = "55555555-5555-4555-8555-555555555555"
const RESOURCE_ID = "66666666-6666-4666-8666-666666666666"

function makePost(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/work-items/${WORK_ITEM_ID}/resources`,
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
  workItemChain.select.mockReturnValue(workItemChain)
  workItemChain.eq.mockReturnValue(workItemChain)
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
  workItemChain.maybeSingle.mockResolvedValue({
    data: { id: WORK_ITEM_ID, project_id: PROJECT_ID },
    error: null,
  })
})

describe("POST allocation", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(
      makePost({ resource_id: RESOURCE_ID, allocation_pct: 50 }),
      { params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }) }
    )
    expect(res.status).toBe(401)
  })

  it("returns 400 on out-of-range allocation_pct", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(
      makePost({ resource_id: RESOURCE_ID, allocation_pct: 250 }),
      { params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it("returns 404 when work item belongs to a different project", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    workItemChain.maybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await POST(
      makePost({ resource_id: RESOURCE_ID, allocation_pct: 50 }),
      { params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }) }
    )
    expect(res.status).toBe(404)
  })

  it("creates allocation on valid input (201)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: {
        id: "a1",
        tenant_id: TENANT_ID,
        project_id: PROJECT_ID,
        work_item_id: WORK_ITEM_ID,
        resource_id: RESOURCE_ID,
        allocation_pct: 50,
      },
      error: null,
    })
    const res = await POST(
      makePost({ resource_id: RESOURCE_ID, allocation_pct: 50 }),
      { params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }) }
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { allocation: { id: string } }
    expect(body.allocation.id).toBe("a1")
  })

  it("returns 409 on duplicate allocation", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate" },
    })
    const res = await POST(
      makePost({ resource_id: RESOURCE_ID, allocation_pct: 50 }),
      { params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }) }
    )
    expect(res.status).toBe(409)
  })
})

describe("GET allocations", () => {
  it("returns 200 with list", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    listChain.__result = {
      data: [
        {
          id: "a1",
          tenant_id: TENANT_ID,
          project_id: PROJECT_ID,
          work_item_id: WORK_ITEM_ID,
          resource_id: RESOURCE_ID,
          allocation_pct: 50,
        },
      ],
      error: null,
    }
    const res = await GET(
      new Request(
        `http://localhost/api/projects/${PROJECT_ID}/work-items/${WORK_ITEM_ID}/resources`
      ),
      { params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }) }
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { allocations: unknown[] }
    expect(body.allocations).toHaveLength(1)
  })
})
