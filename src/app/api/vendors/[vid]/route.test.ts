import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-15 — single-vendor PATCH drift-detection.

const getUserMock = vi.fn()

const tenantMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const vendorChain = {
  select: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "vendors") return vendorChain
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
const USER_ID = "33333333-3333-4333-8333-333333333333"
const VENDOR_ID = "44444444-4444-4444-8444-444444444444"

beforeEach(() => {
  vi.clearAllMocks()
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.order.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.limit.mockReturnValue(tenantMembershipChain)
  vendorChain.select.mockReturnValue(vendorChain)
  vendorChain.update.mockReturnValue(vendorChain)
  vendorChain.eq.mockReturnValue(vendorChain)
  tenantMembershipChain.maybeSingle.mockResolvedValue({
    data: { tenant_id: TENANT_ID, role: "admin" },
    error: null,
  })
})

// ---------------------------------------------------------------------------
// Schema-vs-DB-Payload Drift Detection (PATCH)
// ---------------------------------------------------------------------------
describe("PATCH /api/vendors/[vid] — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB update payload", async () => {
    const { vendorPatchSchema } = await import("../_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    // patchSchema is wrapped in .refine() — unwrap via _def.schema.shape.
    const inner =
      "shape" in vendorPatchSchema
        ? (vendorPatchSchema as unknown as {
            shape: Record<string, unknown>
          })
        : (
            vendorPatchSchema as unknown as {
              _def: { schema: { shape: Record<string, unknown> } }
            }
          )._def.schema
    const schemaKeys = Object.keys(
      (inner as { shape: Record<string, unknown> }).shape
    )

    const kitchenSink: Record<string, unknown> = {
      name: "Updated Vendor",
      category: "Updated Category",
      primary_contact_email: "updated@example.com",
      website: "https://updated.example",
      status: "inactive",
    }

    for (const key of schemaKeys) {
      expect(kitchenSink, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    vendorChain.single.mockResolvedValue({
      data: { id: VENDOR_ID, ...kitchenSink, tenant_id: TENANT_ID },
      error: null,
    })

    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kitchenSink),
      }),
      { params: Promise.resolve({ vid: VENDOR_ID }) }
    )
    expect(res.status).toBe(200)

    const arg = vendorChain.update.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg, "update was not called").toBeTruthy()

    for (const key of schemaKeys) {
      const expected = kitchenSink[key]
      const actual = arg[key]
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
  })
})
