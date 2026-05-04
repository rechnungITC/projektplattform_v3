import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-22 — budget items POST drift-detection test.

const getUserMock = vi.fn()

const categoriesChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const itemsChain = {
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "budget_categories") return categoriesChain
  if (table === "budget_items") return itemsChain
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

import { POST } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const CATEGORY_ID = "55555555-5555-4555-8555-555555555555"

beforeEach(() => {
  vi.clearAllMocks()
  categoriesChain.select.mockReturnValue(categoriesChain)
  categoriesChain.eq.mockReturnValue(categoriesChain)
  itemsChain.insert.mockReturnValue(itemsChain)
  itemsChain.select.mockReturnValue(itemsChain)
  categoriesChain.maybeSingle.mockResolvedValue({
    data: { id: CATEGORY_ID, project_id: PROJECT_ID, tenant_id: TENANT_ID },
    error: null,
  })
})

// ---------------------------------------------------------------------------
// Schema-vs-DB-Payload Drift Detection (POST)
// ---------------------------------------------------------------------------
describe("POST /api/projects/[id]/budget/items — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB insert payload", async () => {
    const { budgetItemCreateSchema } = await import("./_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const kitchenSink = {
      category_id: CATEGORY_ID,
      name: "Drift-Test Item",
      description: "Drift-Test description.",
      planned_amount: 12500.5,
      planned_currency: "EUR",
      position: 3,
      is_active: false,
    }

    const schemaKeys = Object.keys(budgetItemCreateSchema.shape)
    for (const key of schemaKeys) {
      expect(kitchenSink, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    itemsChain.single.mockResolvedValue({
      data: { id: "drift-1", ...kitchenSink, tenant_id: TENANT_ID },
      error: null,
    })

    const res = await POST(
      new Request(
        `http://localhost/api/projects/${PROJECT_ID}/budget/items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(kitchenSink),
        }
      ),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(201)

    const arg = itemsChain.insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg, "insert was not called").toBeTruthy()

    for (const key of schemaKeys) {
      const expected = (kitchenSink as Record<string, unknown>)[key]
      const actual = arg[key]
      // Trimmed: name, description. Numbers + currency + booleans pass through.
      if (
        typeof expected === "string" &&
        (key === "name" || key === "description")
      ) {
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
