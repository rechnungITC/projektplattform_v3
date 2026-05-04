import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-22 — single budget item PATCH drift-detection test.

const getUserMock = vi.fn()

const projectChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const categoriesChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const itemsChain = {
  select: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
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

import { PATCH } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const ITEM_ID = "44444444-4444-4444-8444-444444444444"
const CATEGORY_ID = "55555555-5555-4555-8555-555555555555"
const USER_ID = "33333333-3333-4333-8333-333333333333"

beforeEach(() => {
  vi.clearAllMocks()
  projectChain.select.mockReturnValue(projectChain)
  projectChain.eq.mockReturnValue(projectChain)
  categoriesChain.select.mockReturnValue(categoriesChain)
  categoriesChain.eq.mockReturnValue(categoriesChain)
  itemsChain.select.mockReturnValue(itemsChain)
  itemsChain.update.mockReturnValue(itemsChain)
  itemsChain.eq.mockReturnValue(itemsChain)

  projectChain.maybeSingle.mockResolvedValue({
    data: { tenant_id: TENANT_ID },
    error: null,
  })
  categoriesChain.maybeSingle.mockResolvedValue({
    data: { project_id: PROJECT_ID },
    error: null,
  })
})

// ---------------------------------------------------------------------------
// Schema-vs-DB-Payload Drift Detection (PATCH)
// ---------------------------------------------------------------------------
describe("PATCH /api/projects/[id]/budget/items/[iid] — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB update payload", async () => {
    const { budgetItemPatchSchema } = await import("../_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    // patchSchema is wrapped in .refine() — unwrap via _def.schema.shape.
    const inner =
      "shape" in budgetItemPatchSchema
        ? (budgetItemPatchSchema as unknown as {
            shape: Record<string, unknown>
          })
        : (
            budgetItemPatchSchema as unknown as {
              _def: { schema: { shape: Record<string, unknown> } }
            }
          )._def.schema
    const schemaKeys = Object.keys(
      (inner as { shape: Record<string, unknown> }).shape
    )

    const kitchenSink: Record<string, unknown> = {
      name: "Updated Item",
      description: "Updated description.",
      planned_amount: 9999.99,
      planned_currency: "EUR",
      position: 4,
      is_active: false,
      category_id: CATEGORY_ID,
    }

    for (const key of schemaKeys) {
      expect(kitchenSink, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    itemsChain.maybeSingle.mockResolvedValue({
      data: { id: ITEM_ID, ...kitchenSink },
      error: null,
    })

    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kitchenSink),
      }),
      { params: Promise.resolve({ id: PROJECT_ID, iid: ITEM_ID }) }
    )
    expect(res.status).toBe(200)

    const arg = itemsChain.update.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg, "update was not called").toBeTruthy()

    for (const key of schemaKeys) {
      const expected = kitchenSink[key]
      const actual = arg[key]
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
  })
})
