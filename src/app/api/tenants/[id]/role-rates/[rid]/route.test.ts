import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-24 ST-07 — DELETE /api/tenants/[id]/role-rates/[rid]

const getUserMock = vi.fn()
const auditInsertMock = vi.fn()

const tenantMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

// roleRatesChain handles two distinct paths: read-then-delete.
const roleRatesChain: {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  __readResult: { data: unknown; error: { message: string } | null }
  __deleteResult: {
    data: unknown
    error: { code?: string; message: string } | null
  }
  __mode: "read" | "delete"
} = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(async () => {
    if (roleRatesChain.__mode === "read") return roleRatesChain.__readResult
    return roleRatesChain.__deleteResult
  }),
  delete: vi.fn(() => {
    roleRatesChain.__mode = "delete"
    return roleRatesChain
  }),
  __readResult: { data: null, error: null },
  __deleteResult: { data: null, error: null },
  __mode: "read",
}

const fromMock = vi.fn((table: string) => {
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "role_rates") {
    // Reset mode to "read" each call. The route does select first, then
    // delete — and `delete()` flips the mode back to delete.
    roleRatesChain.__mode = "read"
    return roleRatesChain
  }
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

import { DELETE } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const RATE_ID = "44444444-4444-4444-8444-444444444444"
const USER_ID = "22222222-2222-4222-8222-222222222222"

function makeReq(): Request {
  return new Request(
    `http://localhost/api/tenants/${TENANT_ID}/role-rates/${RATE_ID}`,
    { method: "DELETE" }
  )
}
function makeCtx() {
  return { params: Promise.resolve({ id: TENANT_ID, rid: RATE_ID }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  roleRatesChain.select.mockReturnValue(roleRatesChain)
  roleRatesChain.eq.mockReturnValue(roleRatesChain)
  roleRatesChain.delete.mockImplementation(() => {
    roleRatesChain.__mode = "delete"
    return roleRatesChain
  })
  roleRatesChain.__readResult = { data: null, error: null }
  roleRatesChain.__deleteResult = { data: null, error: null }
  roleRatesChain.__mode = "read"
  auditInsertMock.mockResolvedValue({ data: null, error: null })
})

describe("DELETE /api/tenants/[id]/role-rates/[rid]", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeReq(), makeCtx())
    expect(res.status).toBe(401)
  })

  it("returns 403 when caller is not tenant admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: { role: "member" },
      error: null,
    })
    const res = await DELETE(makeReq(), makeCtx())
    expect(res.status).toBe(403)
  })

  it("returns 404 when rate does not exist", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    })
    roleRatesChain.__readResult = { data: null, error: null }
    const res = await DELETE(makeReq(), makeCtx())
    expect(res.status).toBe(404)
  })

  it("returns 400 on invalid rate id", async () => {
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: TENANT_ID, rid: "not-a-uuid" }),
    })
    expect(res.status).toBe(400)
  })

  it("happy path: deletes rate (204) + writes synthetic audit", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    })
    roleRatesChain.__readResult = {
      data: {
        id: RATE_ID,
        role_key: "developer",
        daily_rate: 1000,
        currency: "EUR",
        valid_from: "2026-01-01",
      },
      error: null,
    }
    roleRatesChain.__deleteResult = {
      data: { id: RATE_ID },
      error: null,
    }
    const res = await DELETE(makeReq(), makeCtx())
    expect(res.status).toBe(204)
    expect(auditInsertMock).toHaveBeenCalledTimes(1)
    const auditPayload = auditInsertMock.mock.calls[0][0] as Record<
      string,
      unknown
    >
    expect(auditPayload.entity_type).toBe("role_rates")
    expect(auditPayload.field_name).toBe("row_deleted")
    // old_value is the captured snapshot
    const oldValue = auditPayload.old_value as Record<string, unknown>
    expect(oldValue.role_key).toBe("developer")
  })
})
