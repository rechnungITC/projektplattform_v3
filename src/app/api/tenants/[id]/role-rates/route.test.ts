import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-24 ST-07 — GET + POST /api/tenants/[id]/role-rates

const getUserMock = vi.fn()
const auditInsertMock = vi.fn()

const tenantMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

// Used by both list and insert paths.
const roleRatesChain: {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  then: (resolve: (v: unknown) => void) => void
  __listResult: { data: unknown[] | null; error: { message: string } | null }
  __insertResult: {
    data: unknown
    error: { code?: string; message: string } | null
  }
} = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  single: vi.fn(async () => roleRatesChain.__insertResult),
  __listResult: { data: [], error: null },
  __insertResult: { data: null, error: null },
  then: (resolve) => resolve(roleRatesChain.__listResult),
}

const fromMock = vi.fn((table: string) => {
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "role_rates") return roleRatesChain
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: () => ({ insert: auditInsertMock }),
  })),
}))

import { GET, POST } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "22222222-2222-4222-8222-222222222222"

function makeListReq(): Request {
  return new Request(
    `http://localhost/api/tenants/${TENANT_ID}/role-rates`
  )
}
function makePostReq(body: unknown): Request {
  return new Request(
    `http://localhost/api/tenants/${TENANT_ID}/role-rates`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
}
function makeCtx() {
  return { params: Promise.resolve({ id: TENANT_ID }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  roleRatesChain.select.mockReturnValue(roleRatesChain)
  roleRatesChain.eq.mockReturnValue(roleRatesChain)
  roleRatesChain.order.mockReturnValue(roleRatesChain)
  roleRatesChain.limit.mockReturnValue(roleRatesChain)
  roleRatesChain.insert.mockReturnValue(roleRatesChain)
  roleRatesChain.__listResult = { data: [], error: null }
  roleRatesChain.__insertResult = { data: null, error: null }
  auditInsertMock.mockResolvedValue({ data: null, error: null })
})

describe("GET /api/tenants/[id]/role-rates", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeListReq(), makeCtx())
    expect(res.status).toBe(401)
  })

  it("returns 200 with the rates list (RLS-filtered)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    roleRatesChain.__listResult = {
      data: [
        {
          id: "r1",
          tenant_id: TENANT_ID,
          role_key: "developer",
          daily_rate: 1000,
          currency: "EUR",
          valid_from: "2026-01-01",
        },
      ],
      error: null,
    }
    const res = await GET(makeListReq(), makeCtx())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { rates: Array<{ id: string }> }
    expect(body.rates).toHaveLength(1)
    expect(body.rates[0].id).toBe("r1")
  })

  it("returns empty list for cross-tenant (RLS hides rows)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    // RLS-equivalent: empty result for non-members of this tenant.
    roleRatesChain.__listResult = { data: [], error: null }
    const res = await GET(makeListReq(), makeCtx())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { rates: unknown[] }
    expect(body.rates).toEqual([])
  })

  it("returns 400 on invalid tenant id", async () => {
    const res = await GET(makeListReq(), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    })
    expect(res.status).toBe(400)
  })
})

describe("POST /api/tenants/[id]/role-rates", () => {
  const validBody = {
    role_key: "developer",
    daily_rate: 1000,
    currency: "EUR",
    valid_from: "2026-01-01",
  }

  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePostReq(validBody), makeCtx())
    expect(res.status).toBe(401)
  })

  it("returns 403 when caller is not tenant admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: { role: "member" },
      error: null,
    })
    const res = await POST(makePostReq(validBody), makeCtx())
    expect(res.status).toBe(403)
  })

  it("returns 403 when caller has no membership", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    })
    const res = await POST(makePostReq(validBody), makeCtx())
    expect(res.status).toBe(403)
  })

  it("returns 400 on validation error (negative rate)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    })
    const res = await POST(
      makePostReq({ ...validBody, daily_rate: -1 }),
      makeCtx()
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("validation_error")
  })

  it("returns 400 on invalid currency", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    })
    const res = await POST(
      makePostReq({ ...validBody, currency: "XYZ" }),
      makeCtx()
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 on bad date format", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    })
    const res = await POST(
      makePostReq({ ...validBody, valid_from: "01.01.2026" }),
      makeCtx()
    )
    expect(res.status).toBe(400)
  })

  it("returns 409 on duplicate (role_key, valid_from)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    })
    roleRatesChain.__insertResult = {
      data: null,
      error: { code: "23505", message: "duplicate" },
    }
    const res = await POST(makePostReq(validBody), makeCtx())
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe("rate_exists")
  })

  it("happy path: creates rate (201) + writes synthetic audit", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    })
    roleRatesChain.__insertResult = {
      data: {
        id: "new-rate-id",
        tenant_id: TENANT_ID,
        role_key: "developer",
        daily_rate: 1000,
        currency: "EUR",
        valid_from: "2026-01-01",
      },
      error: null,
    }
    const res = await POST(makePostReq(validBody), makeCtx())
    expect(res.status).toBe(201)
    const body = (await res.json()) as { rate: { id: string } }
    expect(body.rate.id).toBe("new-rate-id")
    // Synthetic audit must be written (best-effort, but should be invoked).
    expect(auditInsertMock).toHaveBeenCalledTimes(1)
    const auditPayload = auditInsertMock.mock.calls[0][0] as Record<
      string,
      unknown
    >
    expect(auditPayload.entity_type).toBe("role_rates")
    expect(auditPayload.field_name).toBe("row_created")
  })
})
