import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-15 — vendor collection endpoint tests.

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

const evalAggChain: {
  select: ReturnType<typeof vi.fn>
  in: ReturnType<typeof vi.fn>
  then: (resolve: (v: unknown) => void) => void
  __result: { data: unknown[] | null; error: { message: string } | null }
} = {
  select: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  __result: { data: [], error: null },
  then: (resolve) => resolve(evalAggChain.__result),
}
const assignAggChain: typeof evalAggChain = {
  select: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  __result: { data: [], error: null },
  then: (resolve) => resolve(assignAggChain.__result),
}

const fromMock = vi.fn((table: string) => {
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "vendors") return Object.assign({}, insertChain, listChain)
  if (table === "vendor_evaluations") return evalAggChain
  if (table === "vendor_project_assignments") return assignAggChain
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
  return new Request("http://localhost/api/vendors", {
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
  evalAggChain.__result = { data: [], error: null }
  assignAggChain.__result = { data: [], error: null }

  tenantMembershipChain.maybeSingle.mockResolvedValue({
    data: { tenant_id: TENANT_ID },
    error: null,
  })
})

describe("POST /api/vendors", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePost({ name: "Vendor X" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 on http:// website (HTTPS-only)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(
      makePost({ name: "X", website: "http://example.com" })
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 on empty name", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(makePost({ name: "" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 on invalid email", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(
      makePost({ name: "X", primary_contact_email: "not-an-email" })
    )
    expect(res.status).toBe(400)
  })

  it("creates vendor on valid input (201)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: {
        id: "v1",
        tenant_id: TENANT_ID,
        name: "Vendor X",
        category: null,
        primary_contact_email: null,
        website: "https://example.com",
        status: "active",
      },
      error: null,
    })
    const res = await POST(
      makePost({ name: "Vendor X", website: "https://example.com" })
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { vendor: { id: string } }
    expect(body.vendor.id).toBe("v1")
  })

  it("returns 403 when caller is not admin/editor (RLS 42501)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "rls" },
    })
    const res = await POST(makePost({ name: "Vendor X" }))
    expect(res.status).toBe(403)
  })
})

describe("GET /api/vendors", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(new Request("http://localhost/api/vendors"))
    expect(res.status).toBe(401)
  })

  it("returns 200 with empty list", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await GET(new Request("http://localhost/api/vendors"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { vendors: unknown[] }
    expect(body.vendors).toEqual([])
  })

  it("computes avg_score and counts on-the-fly", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    listChain.__result = {
      data: [
        {
          id: "v1",
          tenant_id: TENANT_ID,
          name: "A",
          category: null,
          primary_contact_email: null,
          website: null,
          status: "active",
          created_by: USER_ID,
          created_at: "2026-04-30T00:00:00Z",
          updated_at: "2026-04-30T00:00:00Z",
        },
      ],
      error: null,
    }
    evalAggChain.__result = {
      data: [
        { vendor_id: "v1", score: 5 },
        { vendor_id: "v1", score: 3 },
        { vendor_id: "v1", score: 4 },
      ],
      error: null,
    }
    assignAggChain.__result = {
      data: [{ vendor_id: "v1" }, { vendor_id: "v1" }],
      error: null,
    }
    const res = await GET(new Request("http://localhost/api/vendors"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      vendors: Array<{
        id: string
        avg_score: number | null
        evaluation_count: number
        assignment_count: number
      }>
    }
    expect(body.vendors).toHaveLength(1)
    // avg of [5, 3, 4] = 4.0
    expect(body.vendors[0].avg_score).toBe(4)
    expect(body.vendors[0].evaluation_count).toBe(3)
    expect(body.vendors[0].assignment_count).toBe(2)
  })

  it("filters by status when query param is valid", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    listChain.__result = { data: [], error: null }
    const res = await GET(
      new Request("http://localhost/api/vendors?status=inactive")
    )
    expect(res.status).toBe(200)
    expect(listChain.eq).toHaveBeenCalledWith("status", "inactive")
  })

  it("ignores invalid status param", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    listChain.__result = { data: [], error: null }
    const res = await GET(
      new Request("http://localhost/api/vendors?status=archived")
    )
    expect(res.status).toBe(200)
    expect(listChain.eq).not.toHaveBeenCalledWith("status", "archived")
  })
})

// ---------------------------------------------------------------------------
// Schema-vs-DB-Payload Drift Detection (POST)
// ---------------------------------------------------------------------------
describe("POST /api/vendors — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB insert payload", async () => {
    const { vendorCreateSchema } = await import("./_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const kitchenSink = {
      name: "Drift Vendor GmbH",
      category: "IT",
      primary_contact_email: "info@drift.example",
      website: "https://drift.example",
      status: "active" as const,
    }

    const schemaKeys = Object.keys(vendorCreateSchema.shape)
    for (const key of schemaKeys) {
      expect(kitchenSink, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    insertChain.single.mockResolvedValue({
      data: { id: "drift-1", ...kitchenSink, tenant_id: TENANT_ID },
      error: null,
    })

    const res = await POST(makePost(kitchenSink))
    expect(res.status).toBe(201)

    const arg = insertChain.insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg, "insert was not called").toBeTruthy()

    for (const key of schemaKeys) {
      const expected = (kitchenSink as Record<string, unknown>)[key]
      const actual = arg[key]
      // status is enum (no trim); name/category/email/website are trimmed.
      if (typeof expected === "string" && key !== "status") {
        expect(actual, `field '${key}' was dropped before reaching DB`).toBe(
          expected.trim() || null
        )
      } else {
        expect(actual, `field '${key}' was dropped before reaching DB`).toBe(
          expected
        )
      }
    }

    expect(arg.tenant_id).toBe(TENANT_ID)
    expect(arg.created_by).toBe(USER_ID)
  })
})
