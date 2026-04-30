import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()

const tenantMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const upsertChain = {
  upsert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "tenant_method_overrides") return upsertChain
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { PUT } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "33333333-3333-4333-8333-333333333333"

function makePut(body: unknown, key: string): { req: Request; ctx: { params: Promise<{ key: string }> } } {
  return {
    req: new Request(
      `http://localhost/api/master-data/method-overrides/${key}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    ),
    ctx: { params: Promise.resolve({ key }) },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.order.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.limit.mockReturnValue(tenantMembershipChain)
  upsertChain.upsert.mockReturnValue(upsertChain)
  upsertChain.select.mockReturnValue(upsertChain)
})

describe("PUT /api/master-data/method-overrides/[key]", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const { req, ctx } = makePut({ enabled: false }, "scrum")
    const res = await PUT(req, ctx)
    expect(res.status).toBe(401)
  })

  it("returns 404 for unknown method key", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const { req, ctx } = makePut({ enabled: false }, "carrier-pigeon")
    const res = await PUT(req, ctx)
    expect(res.status).toBe(404)
  })

  it("returns 400 when enabled is missing", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const { req, ctx } = makePut({}, "scrum")
    const res = await PUT(req, ctx)
    expect(res.status).toBe(400)
  })

  it("returns 403 when caller is not tenant admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    let call = 0
    tenantMembershipChain.maybeSingle.mockImplementation(async () => {
      call++
      if (call === 1) return { data: { tenant_id: TENANT_ID }, error: null }
      return { data: { role: "member" }, error: null }
    })
    const { req, ctx } = makePut({ enabled: false }, "scrum")
    const res = await PUT(req, ctx)
    expect(res.status).toBe(403)
  })

  it("upserts and returns 200 on happy path", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    let call = 0
    tenantMembershipChain.maybeSingle.mockImplementation(async () => {
      call++
      if (call === 1) return { data: { tenant_id: TENANT_ID }, error: null }
      return { data: { role: "admin" }, error: null }
    })
    upsertChain.single.mockResolvedValue({
      data: {
        id: "row-1",
        tenant_id: TENANT_ID,
        method_key: "safe",
        enabled: false,
      },
      error: null,
    })
    const { req, ctx } = makePut({ enabled: false }, "safe")
    const res = await PUT(req, ctx)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { override: { method_key: string } }
    expect(body.override.method_key).toBe("safe")
  })

  it("maps the trigger's P0001 to 422 min_one_method_enabled", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    let call = 0
    tenantMembershipChain.maybeSingle.mockImplementation(async () => {
      call++
      if (call === 1) return { data: { tenant_id: TENANT_ID }, error: null }
      return { data: { role: "admin" }, error: null }
    })
    upsertChain.single.mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message:
          "min_one_method_enabled: tenant must keep at least one method enabled",
      },
    })
    const { req, ctx } = makePut({ enabled: false }, "scrum")
    const res = await PUT(req, ctx)
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("min_one_method_enabled")
  })
})
