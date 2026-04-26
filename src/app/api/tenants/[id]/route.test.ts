import { beforeEach, describe, expect, it, vi } from "vitest"

// -----------------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------------
//
// Two query chains are used by the route:
//   - first .from("tenant_memberships") -> membership-check chain
//   - second .from("tenants") -> tenant-update chain
// The mock returns the appropriate chain based on the table name.

const getUserMock = vi.fn()

const membershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const tenantUpdateChain = {
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "tenant_memberships") return membershipChain
  if (table === "tenants") return tenantUpdateChain
  throw new Error(`Unexpected table: ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { PATCH } from "./route"

// -----------------------------------------------------------------------------

const TENANT_ID = "11111111-1111-1111-1111-111111111111"
const USER_ID = "22222222-2222-2222-2222-222222222222"

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/tenants/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function makeContext() {
  return { params: Promise.resolve({ id: TENANT_ID }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  membershipChain.select.mockReturnValue(membershipChain)
  membershipChain.eq.mockReturnValue(membershipChain)
  tenantUpdateChain.update.mockReturnValue(tenantUpdateChain)
  tenantUpdateChain.eq.mockReturnValue(tenantUpdateChain)
  tenantUpdateChain.select.mockReturnValue(tenantUpdateChain)
})

describe("PATCH /api/tenants/[id]", () => {
  it("happy path: admin renames tenant, returns updated row", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    membershipChain.maybeSingle.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    })
    const updatedRow = {
      id: TENANT_ID,
      name: "Acme",
      domain: null,
      created_at: "now",
      created_by: USER_ID,
    }
    tenantUpdateChain.maybeSingle.mockResolvedValue({
      data: updatedRow,
      error: null,
    })

    const res = await PATCH(makeRequest({ name: "Acme" }), makeContext())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tenant: updatedRow })
    expect(tenantUpdateChain.update).toHaveBeenCalledWith({ name: "Acme" })
  })

  it("normalizes domain to lowercase + trimmed", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    membershipChain.maybeSingle.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    })
    tenantUpdateChain.maybeSingle.mockResolvedValue({
      data: { id: TENANT_ID, name: "x", domain: "firma.de" },
      error: null,
    })

    await PATCH(makeRequest({ domain: "  Firma.DE " }), makeContext())
    expect(tenantUpdateChain.update).toHaveBeenCalledWith({ domain: "firma.de" })
  })

  it("allows clearing domain by passing null", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    membershipChain.maybeSingle.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    })
    tenantUpdateChain.maybeSingle.mockResolvedValue({
      data: { id: TENANT_ID, name: "x", domain: null },
      error: null,
    })

    await PATCH(makeRequest({ domain: null }), makeContext())
    expect(tenantUpdateChain.update).toHaveBeenCalledWith({ domain: null })
  })

  it("returns 400 when no fields provided", async () => {
    const res = await PATCH(makeRequest({}), makeContext())
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("validation_error")
  })

  it("returns 400 on empty name", async () => {
    const res = await PATCH(makeRequest({ name: "" }), makeContext())
    expect(res.status).toBe(400)
  })

  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makeRequest({ name: "x" }), makeContext())
    expect(res.status).toBe(401)
  })

  it("returns 403 when caller is not admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    membershipChain.maybeSingle.mockResolvedValue({
      data: { role: "viewer" },
      error: null,
    })

    const res = await PATCH(makeRequest({ name: "x" }), makeContext())
    expect(res.status).toBe(403)
    expect(tenantUpdateChain.update).not.toHaveBeenCalled()
  })

  it("returns 409 on duplicate domain (unique violation)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    membershipChain.maybeSingle.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    })
    tenantUpdateChain.maybeSingle.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key value" },
    })

    const res = await PATCH(makeRequest({ domain: "taken.com" }), makeContext())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe("domain_taken")
    expect(body.error.field).toBe("domain")
  })
})
