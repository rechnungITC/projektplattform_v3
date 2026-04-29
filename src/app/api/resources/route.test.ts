import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-11 — collection endpoint tests for /api/resources.

const getUserMock = vi.fn()

const tenantMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
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
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "resources") return Object.assign({}, insertChain, listChain)
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
const USER_ID = "33333333-3333-4333-8333-333333333333"

function makePost(body: unknown): Request {
  return new Request("http://localhost/api/resources", {
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
  insertChain.insert.mockReturnValue(insertChain)
  insertChain.select.mockReturnValue(insertChain)
  listChain.__result = { data: [], error: null }

  tenantMembershipChain.maybeSingle.mockResolvedValue({
    data: { tenant_id: TENANT_ID },
    error: null,
  })
})

describe("POST /api/resources", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePost({ display_name: "Anna" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 when display_name is empty", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(makePost({ display_name: "" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 on out-of-range fte_default", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(
      makePost({ display_name: "Anna", fte_default: 1.5 })
    )
    expect(res.status).toBe(400)
  })

  it("returns 403 when no tenant membership", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    })
    const res = await POST(makePost({ display_name: "Anna" }))
    expect(res.status).toBe(403)
  })

  it("creates resource on valid input (201)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: {
        id: "r1",
        tenant_id: TENANT_ID,
        display_name: "Anna",
        kind: "internal",
        fte_default: 0.8,
      },
      error: null,
    })
    const res = await POST(
      makePost({ display_name: "Anna", fte_default: 0.8 })
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { resource: { id: string } }
    expect(body.resource.id).toBe("r1")
  })

  it("returns 409 on duplicate (linked_user_id unique)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "unique_violation" },
    })
    const res = await POST(
      makePost({
        display_name: "Anna",
        linked_user_id: "44444444-4444-4444-8444-444444444444",
      })
    )
    expect(res.status).toBe(409)
  })
})

describe("GET /api/resources", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(new Request("http://localhost/api/resources"))
    expect(res.status).toBe(401)
  })

  it("returns 200 with resources list", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    listChain.__result = {
      data: [
        {
          id: "r1",
          tenant_id: TENANT_ID,
          display_name: "Anna",
          kind: "internal",
        },
      ],
      error: null,
    }
    const res = await GET(new Request("http://localhost/api/resources"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { resources: unknown[] }
    expect(body.resources).toHaveLength(1)
  })

  it("filters by active_only and kind", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    listChain.__result = { data: [], error: null }
    const res = await GET(
      new Request("http://localhost/api/resources?active_only=true&kind=external")
    )
    expect(res.status).toBe(200)
    expect(listChain.eq).toHaveBeenCalledWith("is_active", true)
    expect(listChain.eq).toHaveBeenCalledWith("kind", "external")
  })
})
