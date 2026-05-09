import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-62 — organization-units collection endpoint tests.
//
// Covers the auth + admin gates, validation, and create happy-path.
// The live smoke test (DB DO-block) covers the migration's
// trigger / RPC / RLS semantics; this Vitest layer covers the route
// wiring. Live DB calls are mocked.

const getUserMock = vi.fn()

const tenantMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const orgUnitsChain: {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  then: (resolve: (v: unknown) => void) => void
  __listResult: { data: unknown[] | null; error: { message: string } | null }
} = {
  select: vi.fn(() => orgUnitsChain),
  eq: vi.fn(() => orgUnitsChain),
  order: vi.fn(() => orgUnitsChain),
  insert: vi.fn(() => orgUnitsChain),
  single: vi.fn(),
  __listResult: { data: [], error: null },
  then(resolve) {
    resolve(orgUnitsChain.__listResult)
  },
}

const fromMock = vi.fn((table: string) => {
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "organization_units") return orgUnitsChain
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
const USER_ID = "33333333-3333-4333-8333-333333333333"

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/organization-units", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.order.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.limit.mockReturnValue(tenantMembershipChain)
  orgUnitsChain.select.mockReturnValue(orgUnitsChain)
  orgUnitsChain.eq.mockReturnValue(orgUnitsChain)
  orgUnitsChain.order.mockReturnValue(orgUnitsChain)
  orgUnitsChain.insert.mockReturnValue(orgUnitsChain)
})

describe("GET /api/organization-units", () => {
  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("returns 403 when user has no tenant membership", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    })
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("returns the list for a member", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle
      .mockResolvedValueOnce({
        data: { tenant_id: TENANT_ID },
        error: null,
      })
      .mockResolvedValueOnce({ data: { role: "member" }, error: null })
    orgUnitsChain.__listResult = {
      data: [
        {
          id: "11111111-1111-4111-8111-aaaaaaaaaaaa",
          tenant_id: TENANT_ID,
          parent_id: null,
          name: "Acme",
          code: "ACME",
          type: "company",
          location_id: null,
          description: null,
          is_active: true,
          sort_order: null,
          created_at: "2026-05-09T00:00:00Z",
          updated_at: "2026-05-09T00:00:00Z",
        },
      ],
      error: null,
    }
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { units: unknown[] }
    expect(body.units).toHaveLength(1)
  })
})

describe("POST /api/organization-units", () => {
  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePost({ name: "X", type: "team" }))
    expect(res.status).toBe(401)
  })

  it("returns 403 when user is not admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle
      // active-tenant resolution
      .mockResolvedValueOnce({
        data: { tenant_id: TENANT_ID },
        error: null,
      })
      // admin-check
      .mockResolvedValueOnce({ data: { role: "member" }, error: null })

    const res = await POST(makePost({ name: "X", type: "team" }))
    expect(res.status).toBe(403)
  })

  it("returns 400 on invalid body (missing name)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle
      .mockResolvedValueOnce({
        data: { tenant_id: TENANT_ID },
        error: null,
      })
      .mockResolvedValueOnce({ data: { role: "admin" }, error: null })

    const res = await POST(makePost({ type: "team" }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("validation_error")
  })

  it("returns 400 on invalid type", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle
      .mockResolvedValueOnce({
        data: { tenant_id: TENANT_ID },
        error: null,
      })
      .mockResolvedValueOnce({ data: { role: "admin" }, error: null })

    const res = await POST(makePost({ name: "X", type: "not_a_kind" }))
    expect(res.status).toBe(400)
  })

  it("returns 201 on successful create", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle
      .mockResolvedValueOnce({
        data: { tenant_id: TENANT_ID },
        error: null,
      })
      .mockResolvedValueOnce({ data: { role: "admin" }, error: null })
    orgUnitsChain.single.mockResolvedValue({
      data: {
        id: "11111111-1111-4111-8111-aaaaaaaaaaaa",
        tenant_id: TENANT_ID,
        parent_id: null,
        name: "Eng",
        code: null,
        type: "department",
        location_id: null,
        description: null,
        is_active: true,
        sort_order: null,
        created_at: "2026-05-09T00:00:00Z",
        updated_at: "2026-05-09T00:00:00Z",
      },
      error: null,
    })

    const res = await POST(makePost({ name: "Eng", type: "department" }))
    expect(res.status).toBe(201)
    const body = (await res.json()) as { unit: { id: string } }
    expect(body.unit.id).toBe("11111111-1111-4111-8111-aaaaaaaaaaaa")
  })

  it("maps unique-violation to 409 conflict", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle
      .mockResolvedValueOnce({
        data: { tenant_id: TENANT_ID },
        error: null,
      })
      .mockResolvedValueOnce({ data: { role: "admin" }, error: null })
    orgUnitsChain.single.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    })

    const res = await POST(
      makePost({ name: "Dup", type: "team", code: "ENG" }),
    )
    expect(res.status).toBe(409)
  })

  it("maps cross_tenant_parent to 400 invalid_parent", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle
      .mockResolvedValueOnce({
        data: { tenant_id: TENANT_ID },
        error: null,
      })
      .mockResolvedValueOnce({ data: { role: "admin" }, error: null })
    orgUnitsChain.single.mockResolvedValue({
      data: null,
      error: { code: "P0003", message: "cross_tenant_parent" },
    })

    const res = await POST(
      makePost({
        name: "Bad",
        type: "team",
        parent_id: "22222222-2222-4222-8222-222222222222",
      }),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("invalid_parent")
  })
})
