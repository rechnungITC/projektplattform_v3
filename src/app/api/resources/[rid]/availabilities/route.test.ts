import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-11 — resource availabilities POST drift-detection.

const getUserMock = vi.fn()

const resourcesChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const availChain = {
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "resources") return resourcesChain
  if (table === "resource_availabilities") return availChain
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
const USER_ID = "33333333-3333-4333-8333-333333333333"
const RESOURCE_ID = "44444444-4444-4444-8444-444444444444"

beforeEach(() => {
  vi.clearAllMocks()
  resourcesChain.select.mockReturnValue(resourcesChain)
  resourcesChain.eq.mockReturnValue(resourcesChain)
  availChain.insert.mockReturnValue(availChain)
  availChain.select.mockReturnValue(availChain)
  resourcesChain.maybeSingle.mockResolvedValue({
    data: { id: RESOURCE_ID, tenant_id: TENANT_ID },
    error: null,
  })
})

describe("POST /api/resources/[rid]/availabilities — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB insert payload", async () => {
    const { availabilityCreateSchema } = await import("./_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const kitchenSink = {
      start_date: "2026-05-01",
      end_date: "2026-05-31",
      fte: 0.6,
      note: "Drift-Test note",
    }

    // createSchema is wrapped in .refine() — unwrap via _def.schema.shape.
    const inner =
      "shape" in availabilityCreateSchema
        ? (availabilityCreateSchema as unknown as {
            shape: Record<string, unknown>
          })
        : (
            availabilityCreateSchema as unknown as {
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

    availChain.single.mockResolvedValue({
      data: { id: "drift-1", ...kitchenSink, tenant_id: TENANT_ID },
      error: null,
    })

    const res = await POST(
      new Request(
        `http://localhost/api/resources/${RESOURCE_ID}/availabilities`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(kitchenSink),
        }
      ),
      { params: Promise.resolve({ rid: RESOURCE_ID }) }
    )
    expect(res.status).toBe(201)

    const arg = availChain.insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg, "insert was not called").toBeTruthy()

    for (const key of schemaKeys) {
      const expected = (kitchenSink as Record<string, unknown>)[key]
      const actual = arg[key]
      // Dates are YYYY-MM-DD; only `note` is trimmed.
      if (typeof expected === "string" && key === "note") {
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
    expect(arg.resource_id).toBe(RESOURCE_ID)
  })
})
