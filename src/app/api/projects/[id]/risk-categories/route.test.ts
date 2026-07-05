import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-107 — project-scoped risk-category list (form data source) tests.

const getUserMock = vi.fn()
const rpcMock = vi.fn()

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
const categoriesChain: {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  __result: { data: unknown[] | null; error: { message: string } | null }
  then: (resolve: (v: unknown) => void) => void
} = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  __result: { data: [], error: null },
  then: (resolve) => resolve(categoriesChain.__result),
}

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "project_memberships") return projectMembershipChain
  if (table === "risk_categories") return categoriesChain
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))

import { GET } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"

function makeReq() {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/risk-categories`
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
  categoriesChain.select.mockReturnValue(categoriesChain)
  categoriesChain.eq.mockReturnValue(categoriesChain)
  categoriesChain.order.mockReturnValue(categoriesChain)
  categoriesChain.limit.mockReturnValue(categoriesChain)
  rpcMock.mockResolvedValue({ error: null })

  // requireProjectAccess + project_type live on the same projects row.
  projectChain.maybeSingle.mockResolvedValue({
    data: { id: PROJECT_ID, tenant_id: TENANT_ID, project_type: "ma" },
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

describe("GET /api/projects/[id]/risk-categories", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("seeds the M&A set and filters by project type", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    categoriesChain.__result = {
      data: [
        { id: "c1", key: "legal", applies_to_project_type: "ma", is_active: true },
        { id: "c2", key: "generic", applies_to_project_type: null, is_active: true },
        { id: "c3", key: "erp_only", applies_to_project_type: "erp", is_active: true },
      ],
      error: null,
    }
    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(200)
    // M&A project → seed RPC invoked once.
    expect(rpcMock).toHaveBeenCalledWith(
      "seed_risk_categories_if_empty",
      { p_tenant_id: TENANT_ID }
    )
    const body = (await res.json()) as { categories: { key: string }[] }
    // 'erp_only' is filtered out; 'ma' + null (all types) remain.
    expect(body.categories.map((c) => c.key).sort()).toEqual(["generic", "legal"])
  })

  it("does not seed for a non-M&A project", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    projectChain.maybeSingle.mockResolvedValue({
      data: { id: PROJECT_ID, tenant_id: TENANT_ID, project_type: "erp" },
      error: null,
    })
    categoriesChain.__result = { data: [], error: null }
    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(200)
    expect(rpcMock).not.toHaveBeenCalled()
  })
})
