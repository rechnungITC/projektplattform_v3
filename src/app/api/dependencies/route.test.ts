import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-9 Round 2 — tenant-level polymorphic-dependencies POST.

const getUserMock = vi.fn()

const tenantMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const insertChain = {
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "dependencies") return insertChain
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { POST } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const FROM_ID = "44444444-4444-4444-8444-444444444444"
const TO_ID = "55555555-5555-4555-8555-555555555555"

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/dependencies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.maybeSingle.mockResolvedValue({
    data: { role: "editor" },
    error: null,
  })
  insertChain.insert.mockReturnValue(insertChain)
  insertChain.select.mockReturnValue(insertChain)
})

describe("POST /api/dependencies", () => {
  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(
      makePost({
        tenant_id: TENANT_ID,
        from_type: "todo",
        from_id: FROM_ID,
        to_type: "todo",
        to_id: TO_ID,
      })
    )
    expect(res.status).toBe(401)
  })

  it("returns 400 on bad body", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(makePost({ tenant_id: "not-a-uuid" }))
    expect(res.status).toBe(400)
  })

  it("returns 422 self_dependency when from == to", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(
      makePost({
        tenant_id: TENANT_ID,
        from_type: "todo",
        from_id: FROM_ID,
        to_type: "todo",
        to_id: FROM_ID,
      })
    )
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("self_dependency")
  })

  it("returns 403 when user is not a member of the tenant", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    })
    const res = await POST(
      makePost({
        tenant_id: TENANT_ID,
        from_type: "todo",
        from_id: FROM_ID,
        to_type: "todo",
        to_id: TO_ID,
      })
    )
    expect(res.status).toBe(403)
  })

  it("inserts a polymorphic edge (201)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: {
        id: "dep-1",
        tenant_id: TENANT_ID,
        from_type: "work_package",
        from_id: FROM_ID,
        to_type: "todo",
        to_id: TO_ID,
        constraint_type: "FS",
        lag_days: 0,
      },
      error: null,
    })

    const res = await POST(
      makePost({
        tenant_id: TENANT_ID,
        from_type: "work_package",
        from_id: FROM_ID,
        to_type: "todo",
        to_id: TO_ID,
        constraint_type: "FS",
      })
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      dependency: { id: string; from_type: string; to_type: string }
    }
    expect(body.dependency.id).toBe("dep-1")
    expect(body.dependency.from_type).toBe("work_package")
  })

  it("returns 422 duplicate_dependency on UNIQUE violation (23505)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate" },
    })
    const res = await POST(
      makePost({
        tenant_id: TENANT_ID,
        from_type: "todo",
        from_id: FROM_ID,
        to_type: "todo",
        to_id: TO_ID,
      })
    )
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("duplicate_dependency")
  })

  it("returns 422 cycle_detected on check_violation with cycle message", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "dependency cycle detected (todo X → todo Y)",
      },
    })
    const res = await POST(
      makePost({
        tenant_id: TENANT_ID,
        from_type: "todo",
        from_id: FROM_ID,
        to_type: "todo",
        to_id: TO_ID,
      })
    )
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("cycle_detected")
  })

  it("returns 422 cross_tenant on tenant-boundary violation (22023)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: null,
      error: { code: "22023", message: "cross-tenant dependencies are not allowed" },
    })
    const res = await POST(
      makePost({
        tenant_id: TENANT_ID,
        from_type: "todo",
        from_id: FROM_ID,
        to_type: "todo",
        to_id: TO_ID,
      })
    )
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("cross_tenant")
  })

  it("returns 422 invalid_reference on FK violation (23503)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: null,
      error: {
        code: "23503",
        message: "dependency from-entity (todo, …) does not exist",
      },
    })
    const res = await POST(
      makePost({
        tenant_id: TENANT_ID,
        from_type: "todo",
        from_id: FROM_ID,
        to_type: "todo",
        to_id: TO_ID,
      })
    )
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("invalid_reference")
  })
})
