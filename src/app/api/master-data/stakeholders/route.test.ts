import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()

const tenantMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const listChain: {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  ilike: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  then: (resolve: (v: unknown) => void) => void
  __result: { data: unknown[] | null; error: { message: string } | null }
} = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  ilike: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  __result: { data: [], error: null },
  then: (resolve) => resolve(listChain.__result),
}

const fromMock = vi.fn((table: string) => {
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "stakeholders") return listChain
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { GET } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "33333333-3333-4333-8333-333333333333"

beforeEach(() => {
  vi.clearAllMocks()
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.order.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.limit.mockReturnValue(tenantMembershipChain)
  listChain.__result = { data: [], error: null }
})

describe("GET /api/master-data/stakeholders", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(
      new Request("http://localhost/api/master-data/stakeholders")
    )
    expect(res.status).toBe(401)
  })

  it("returns 403 when caller is not tenant admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    let call = 0
    tenantMembershipChain.maybeSingle.mockImplementation(async () => {
      call++
      if (call === 1) return { data: { tenant_id: TENANT_ID }, error: null }
      return { data: { role: "member" }, error: null }
    })
    const res = await GET(
      new Request("http://localhost/api/master-data/stakeholders")
    )
    expect(res.status).toBe(403)
  })

  it("returns rollup rows without contact_email/contact_phone in JSON", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    let call = 0
    tenantMembershipChain.maybeSingle.mockImplementation(async () => {
      call++
      if (call === 1) return { data: { tenant_id: TENANT_ID }, error: null }
      return { data: { role: "admin" }, error: null }
    })
    listChain.__result = {
      data: [
        {
          id: "s1",
          tenant_id: TENANT_ID,
          project_id: "p1",
          name: "Anna",
          role_key: "project_lead",
          org_unit: "IT",
          influence: 4,
          impact: 3,
          is_active: true,
          contact_email: "anna@example.com", // should NOT appear in response
          contact_phone: "+49…", // should NOT appear in response
          projects: { name: "Rollout 1" },
        },
      ],
      error: null,
    }
    const res = await GET(
      new Request("http://localhost/api/master-data/stakeholders")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      rows: Array<Record<string, unknown>>
    }
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0].name).toBe("Anna")
    expect(body.rows[0].project_name).toBe("Rollout 1")
    expect(body.rows[0]).not.toHaveProperty("contact_email")
    expect(body.rows[0]).not.toHaveProperty("contact_phone")
  })

  it("returns CSV with class-3 fields redacted to [redacted]", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    let call = 0
    tenantMembershipChain.maybeSingle.mockImplementation(async () => {
      call++
      if (call === 1) return { data: { tenant_id: TENANT_ID }, error: null }
      return { data: { role: "admin" }, error: null }
    })
    listChain.__result = {
      data: [
        {
          id: "s1",
          tenant_id: TENANT_ID,
          project_id: "p1",
          name: "Anna, M.",
          role_key: "project_lead",
          org_unit: "IT",
          influence: 4,
          impact: 3,
          is_active: true,
          projects: { name: "Rollout 1" },
        },
      ],
      error: null,
    }
    const res = await GET(
      new Request(
        "http://localhost/api/master-data/stakeholders?format=csv"
      )
    )
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toMatch(/text\/csv/)
    const text = await res.text()
    expect(text).toContain("name,role_key,")
    expect(text).toContain('"Anna, M."') // RFC-4180 quoting for comma in name
    expect(text).toContain("[redacted]")
    // Make sure raw email never made it in
    expect(text).not.toContain("anna@example.com")
  })

  it("forwards filter query params to supabase eq()", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    let call = 0
    tenantMembershipChain.maybeSingle.mockImplementation(async () => {
      call++
      if (call === 1) return { data: { tenant_id: TENANT_ID }, error: null }
      return { data: { role: "admin" }, error: null }
    })
    listChain.__result = { data: [], error: null }
    const res = await GET(
      new Request(
        "http://localhost/api/master-data/stakeholders?active_only=true&role=project_lead&org_unit=IT&search=anna"
      )
    )
    expect(res.status).toBe(200)
    expect(listChain.eq).toHaveBeenCalledWith("is_active", true)
    expect(listChain.eq).toHaveBeenCalledWith("role_key", "project_lead")
    expect(listChain.eq).toHaveBeenCalledWith("org_unit", "IT")
    expect(listChain.ilike).toHaveBeenCalledWith("name", "%anna%")
  })
})
