import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-20 — collection endpoint tests for /api/projects/[id]/open-items.

const getUserMock = vi.fn()

const projectChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const tenantMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const projectMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const openItemsChain: {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  then: (resolve: (v: unknown) => void) => void
  __listResult: { data: unknown[] | null; error: { message: string } | null }
} = {
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  insert: vi.fn(),
  single: vi.fn(),
  __listResult: { data: [], error: null },
  then: (resolve) => resolve(openItemsChain.__listResult),
}

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "project_memberships") return projectMembershipChain
  if (table === "open_items") return openItemsChain
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
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"

function makePost(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/open-items`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  projectChain.select.mockReturnValue(projectChain)
  projectChain.eq.mockReturnValue(projectChain)
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  projectMembershipChain.select.mockReturnValue(projectMembershipChain)
  projectMembershipChain.eq.mockReturnValue(projectMembershipChain)
  openItemsChain.select.mockReturnValue(openItemsChain)
  openItemsChain.eq.mockReturnValue(openItemsChain)
  openItemsChain.order.mockReturnValue(openItemsChain)
  openItemsChain.limit.mockReturnValue(openItemsChain)
  openItemsChain.insert.mockReturnValue(openItemsChain)
  openItemsChain.__listResult = { data: [], error: null }

  projectChain.maybeSingle.mockResolvedValue({
    data: { id: PROJECT_ID, tenant_id: TENANT_ID },
    error: null,
  })
  tenantMembershipChain.maybeSingle.mockResolvedValue({
    data: { role: "admin" },
    error: null,
  })
  projectMembershipChain.maybeSingle.mockResolvedValue({
    data: null,
    error: null,
  })
})

describe("POST /api/projects/[id]/open-items", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePost({ title: "Verify legal review" }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 400 on missing title", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(makePost({}), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(400)
  })

  it("rejects status='converted' from API (validation_error)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(
      makePost({ title: "X", status: "converted" }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it("creates an open item (201)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    openItemsChain.single.mockResolvedValue({
      data: {
        id: "o1",
        title: "Verify legal review",
        status: "open",
      },
      error: null,
    })
    const res = await POST(makePost({ title: "Verify legal review" }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(201)
  })
})

// ---------------------------------------------------------------------------
// Schema-vs-DB-Payload Drift Detection (POST)
// ---------------------------------------------------------------------------
describe("POST /api/projects/[id]/open-items — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB insert payload", async () => {
    const { openItemCreateSchema } = await import("./_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const STAKEHOLDER_ID = "66666666-6666-4666-8666-666666666666"

    const kitchenSink = {
      title: "Drift-Test Open Item",
      description: "Drift-Test description.",
      status: "in_clarification" as const,
      contact: "external@example.com",
      contact_stakeholder_id: STAKEHOLDER_ID,
    }

    const schemaKeys = Object.keys(openItemCreateSchema.shape)
    for (const key of schemaKeys) {
      expect(kitchenSink, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    openItemsChain.single.mockResolvedValue({
      data: { id: "drift-1", ...kitchenSink, tenant_id: TENANT_ID },
      error: null,
    })

    const res = await POST(makePost(kitchenSink), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(201)

    const arg = openItemsChain.insert.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(arg, "insert was not called").toBeTruthy()

    for (const key of schemaKeys) {
      const expected = (kitchenSink as Record<string, unknown>)[key]
      const actual = arg[key]
      if (typeof expected === "string") {
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
    expect(arg.project_id).toBe(PROJECT_ID)
    expect(arg.created_by).toBe(USER_ID)
  })
})

describe("GET /api/projects/[id]/open-items", () => {
  it("returns 200 with list", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    openItemsChain.__listResult = { data: [], error: null }
    const res = await GET(
      new Request(
        `http://localhost/api/projects/${PROJECT_ID}/open-items`
      ),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(200)
  })

  it("filters by status when valid", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    openItemsChain.__listResult = { data: [], error: null }
    const res = await GET(
      new Request(
        `http://localhost/api/projects/${PROJECT_ID}/open-items?status=in_clarification`
      ),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(200)
    expect(openItemsChain.eq).toHaveBeenCalledWith(
      "status",
      "in_clarification"
    )
  })
})
