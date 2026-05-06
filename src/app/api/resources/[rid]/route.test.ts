import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-11 — single-resource PATCH drift-detection.

const getUserMock = vi.fn()

const resourcesChain = {
  select: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "resources") return resourcesChain
  if (table === "tenant_settings") {
    const chain: { select: unknown; eq: unknown; maybeSingle: unknown } = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
    }
    return chain
  }
  if (table === "tenant_memberships") {
    // PROJ-54-α — admin-only gate for Override-Felder; default-mock
    // returns admin so the existing kitchen-sink drift test passes
    // without changes to its happy-path expectations.
    const chain: { select: unknown; eq: unknown; maybeSingle: unknown } = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: { role: "admin" }, error: null }),
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
const USER_ID = "33333333-3333-4333-8333-333333333333"
const RESOURCE_ID = "44444444-4444-4444-8444-444444444444"

beforeEach(() => {
  vi.clearAllMocks()
  resourcesChain.select.mockReturnValue(resourcesChain)
  resourcesChain.update.mockReturnValue(resourcesChain)
  resourcesChain.eq.mockReturnValue(resourcesChain)
})

describe("PATCH /api/resources/[rid] — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB update payload", async () => {
    const { resourcePatchSchema } = await import("../_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    // patchSchema is wrapped in .refine() — unwrap via _def.schema.shape.
    const inner =
      "shape" in resourcePatchSchema
        ? (resourcePatchSchema as unknown as {
            shape: Record<string, unknown>
          })
        : (
            resourcePatchSchema as unknown as {
              _def: { schema: { shape: Record<string, unknown> } }
            }
          )._def.schema
    const schemaKeys = Object.keys(
      (inner as { shape: Record<string, unknown> }).shape
    )

    const LINKED_USER_ID = "77777777-7777-4777-8777-777777777777"
    const kitchenSink: Record<string, unknown> = {
      display_name: "Updated Resource",
      kind: "external",
      fte_default: 0.5,
      availability_default: 0.7,
      is_active: false,
      linked_user_id: LINKED_USER_ID,
      // PROJ-54-α — Override pair (admin-only at API; both null clears).
      daily_rate_override: null,
      daily_rate_override_currency: null,
    }

    for (const key of schemaKeys) {
      expect(kitchenSink, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    // First load: existing row.
    resourcesChain.maybeSingle.mockResolvedValue({
      data: { id: RESOURCE_ID, tenant_id: TENANT_ID },
      error: null,
    })
    resourcesChain.single.mockResolvedValue({
      data: { id: RESOURCE_ID, ...kitchenSink, tenant_id: TENANT_ID },
      error: null,
    })

    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kitchenSink),
      }),
      { params: Promise.resolve({ rid: RESOURCE_ID }) }
    )
    expect(res.status).toBe(200)

    const arg = resourcesChain.update.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(arg, "update was not called").toBeTruthy()

    for (const key of schemaKeys) {
      const expected = kitchenSink[key]
      const actual = arg[key]
      if (typeof expected === "string" && key === "display_name") {
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
