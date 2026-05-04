import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-22 — budget postings POST drift-detection test.

const getUserMock = vi.fn()

const itemsChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const postingsChain = {
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}
const auditChain = {
  insert: vi.fn().mockResolvedValue({ data: null, error: null }),
}

const fromMock = vi.fn((table: string) => {
  if (table === "budget_items") return itemsChain
  if (table === "budget_postings") return postingsChain
  if (table === "audit_log_entries") return auditChain
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

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }),
}))

import { POST } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const ITEM_ID = "55555555-5555-4555-8555-555555555555"

beforeEach(() => {
  vi.clearAllMocks()
  itemsChain.select.mockReturnValue(itemsChain)
  itemsChain.eq.mockReturnValue(itemsChain)
  postingsChain.insert.mockReturnValue(postingsChain)
  postingsChain.select.mockReturnValue(postingsChain)
  itemsChain.maybeSingle.mockResolvedValue({
    data: {
      id: ITEM_ID,
      project_id: PROJECT_ID,
      tenant_id: TENANT_ID,
      is_active: true,
    },
    error: null,
  })
})

// ---------------------------------------------------------------------------
// Schema-vs-DB-Payload Drift Detection (POST)
// ---------------------------------------------------------------------------
describe("POST /api/projects/[id]/budget/postings — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB insert payload", async () => {
    const { budgetPostingCreateSchema } = await import("./_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const SOURCE_REF_ID = "66666666-6666-4666-8666-666666666666"
    const kitchenSink = {
      item_id: ITEM_ID,
      kind: "actual" as const,
      amount: 1234.56,
      currency: "EUR",
      posted_at: "2026-04-30",
      note: "Drift-Test note",
      source_ref_id: SOURCE_REF_ID,
    }

    const schemaKeys = Object.keys(budgetPostingCreateSchema.shape)
    for (const key of schemaKeys) {
      expect(kitchenSink, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    postingsChain.single.mockResolvedValue({
      data: { id: "drift-1", ...kitchenSink, tenant_id: TENANT_ID },
      error: null,
    })

    const res = await POST(
      new Request(
        `http://localhost/api/projects/${PROJECT_ID}/budget/postings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(kitchenSink),
        }
      ),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(201)

    const arg = postingsChain.insert.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(arg, "insert was not called").toBeTruthy()

    // Every schema field passes through unchanged (no trim helpers for
    // postings — note preserves whitespace verbatim, currency + kind are
    // enums, dates are YYYY-MM-DD).
    for (const key of schemaKeys) {
      const expected = (kitchenSink as Record<string, unknown>)[key]
      expect(arg[key], `field '${key}' was dropped before reaching DB`).toBe(
        expected
      )
    }

    // Server-derived fields:
    expect(arg.tenant_id).toBe(TENANT_ID)
    expect(arg.project_id).toBe(PROJECT_ID)
    expect(arg.created_by).toBe(USER_ID)
    expect(arg.source).toBe("vendor_invoice") // because source_ref_id is set
    expect(arg.reverses_posting_id).toBeNull()
  })

  it("derives source='manual' when source_ref_id is omitted", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    postingsChain.single.mockResolvedValue({
      data: { id: "drift-2" },
      error: null,
    })

    const res = await POST(
      new Request(
        `http://localhost/api/projects/${PROJECT_ID}/budget/postings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item_id: ITEM_ID,
            kind: "actual",
            amount: 50,
            currency: "EUR",
            posted_at: "2026-04-30",
          }),
        }
      ),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(201)

    const arg = postingsChain.insert.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(arg.source).toBe("manual")
  })
})
