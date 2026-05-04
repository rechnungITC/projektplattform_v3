import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-22 — fx-rates POST drift-detection.

const getUserMock = vi.fn()

const fxChain = {
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "fx_rates") return fxChain
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
const USER_ID = "22222222-2222-4222-8222-222222222222"

beforeEach(() => {
  vi.clearAllMocks()
  fxChain.insert.mockReturnValue(fxChain)
  fxChain.select.mockReturnValue(fxChain)
})

describe("POST /api/tenants/[id]/fx-rates — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB insert payload", async () => {
    const { fxRateCreateSchema } = await import("./_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const kitchenSink = {
      from_currency: "USD",
      to_currency: "EUR",
      rate: 0.92,
      valid_on: "2026-05-01",
      source: "manual" as const,
    }

    // createSchema is wrapped in .refine() — unwrap via _def.schema.shape.
    const inner =
      "shape" in fxRateCreateSchema
        ? (fxRateCreateSchema as unknown as { shape: Record<string, unknown> })
        : (
            fxRateCreateSchema as unknown as {
              _def: { schema: { shape: Record<string, unknown> } }
            }
          )._def.schema
    const schemaKeys = Object.keys(
      (inner as { shape: Record<string, unknown> }).shape
    )

    for (const key of schemaKeys) {
      expect(kitchenSink, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    fxChain.single.mockResolvedValue({
      data: { id: "drift-1", ...kitchenSink, tenant_id: TENANT_ID },
      error: null,
    })

    const res = await POST(
      new Request(`http://localhost/api/tenants/${TENANT_ID}/fx-rates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kitchenSink),
      }),
      { params: Promise.resolve({ id: TENANT_ID }) }
    )
    expect(res.status).toBe(201)

    const arg = fxChain.insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg, "insert was not called").toBeTruthy()

    // All fields are enums / numbers / dates — pass through unchanged.
    for (const key of schemaKeys) {
      const expected = (kitchenSink as Record<string, unknown>)[key]
      expect(arg[key], `field '${key}' was dropped before reaching DB`).toBe(
        expected
      )
    }

    expect(arg.tenant_id).toBe(TENANT_ID)
    expect(arg.created_by).toBe(USER_ID)
  })
})
