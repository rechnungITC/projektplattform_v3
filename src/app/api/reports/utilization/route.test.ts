import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-11 — utilization report tests.

const getUserMock = vi.fn()
const rpcMock = vi.fn()

const tenantMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "tenant_memberships") return tenantMembershipChain
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
    rpc: rpcMock,
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
  tenantMembershipChain.maybeSingle.mockResolvedValue({
    data: { tenant_id: TENANT_ID, role: "admin" },
    error: null,
  })
})

describe("GET /api/reports/utilization", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(
      new Request("http://localhost/api/reports/utilization?start=2026-01-01&end=2026-01-31&bucket=week")
    )
    expect(res.status).toBe(401)
  })

  it("returns 400 when start/end missing", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await GET(
      new Request("http://localhost/api/reports/utilization?bucket=week")
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 when start > end", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await GET(
      new Request("http://localhost/api/reports/utilization?start=2026-02-01&end=2026-01-01&bucket=week")
    )
    expect(res.status).toBe(400)
  })

  it("returns 403 when caller is not tenant admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    // First call returns tenant_id; second call (from requireTenantAdmin)
    // returns role='member'.
    let call = 0
    tenantMembershipChain.maybeSingle.mockImplementation(async () => {
      call++
      if (call === 1) return { data: { tenant_id: TENANT_ID }, error: null }
      return { data: { role: "member" }, error: null }
    })
    const res = await GET(
      new Request("http://localhost/api/reports/utilization?start=2026-01-01&end=2026-01-31&bucket=week")
    )
    expect(res.status).toBe(403)
  })

  it("returns JSON cells on happy path", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    let call = 0
    tenantMembershipChain.maybeSingle.mockImplementation(async () => {
      call++
      if (call === 1) return { data: { tenant_id: TENANT_ID }, error: null }
      return { data: { role: "admin" }, error: null }
    })
    rpcMock.mockResolvedValue({
      data: [
        {
          resource_id: "r1",
          resource_name: "Anna",
          bucket_start: "2026-01-05",
          bucket_end: "2026-01-11",
          utilization: 75,
        },
      ],
      error: null,
    })
    const res = await GET(
      new Request(
        "http://localhost/api/reports/utilization?start=2026-01-01&end=2026-01-31&bucket=week"
      )
    )
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith("utilization_report", {
      p_tenant_id: TENANT_ID,
      p_start: "2026-01-01",
      p_end: "2026-01-31",
      p_bucket: "week",
    })
    const body = (await res.json()) as { cells: { resource_name: string }[] }
    expect(body.cells[0].resource_name).toBe("Anna")
  })

  it("returns CSV when format=csv", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    let call = 0
    tenantMembershipChain.maybeSingle.mockImplementation(async () => {
      call++
      if (call === 1) return { data: { tenant_id: TENANT_ID }, error: null }
      return { data: { role: "admin" }, error: null }
    })
    rpcMock.mockResolvedValue({
      data: [
        {
          resource_id: "r1",
          resource_name: "Anna, M.",
          bucket_start: "2026-01-05",
          bucket_end: "2026-01-11",
          utilization: 75,
        },
      ],
      error: null,
    })
    const res = await GET(
      new Request(
        "http://localhost/api/reports/utilization?start=2026-01-01&end=2026-01-31&bucket=week&format=csv"
      )
    )
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toMatch(/text\/csv/)
    const text = await res.text()
    expect(text).toContain("resource_id,resource_name,bucket_start,bucket_end,utilization")
    // Comma-containing name must be quoted.
    expect(text).toContain('"Anna, M."')
    expect(text).toContain("75.00")
  })
})
