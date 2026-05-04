import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-15 — vendor documents POST drift-detection.

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
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const docsChain = {
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "vendors") return vendorChain
  if (table === "vendor_documents") return docsChain
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
const VENDOR_ID = "44444444-4444-4444-8444-444444444444"

beforeEach(() => {
  vi.clearAllMocks()
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.order.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.limit.mockReturnValue(tenantMembershipChain)
  docsChain.insert.mockReturnValue(docsChain)
  docsChain.select.mockReturnValue(docsChain)
  vendorChain.select.mockReturnValue(vendorChain)
  vendorChain.eq.mockReturnValue(vendorChain)
  tenantMembershipChain.maybeSingle.mockResolvedValue({
    data: { tenant_id: TENANT_ID, role: "admin" },
    error: null,
  })
  vendorChain.maybeSingle.mockResolvedValue({
    data: { id: VENDOR_ID },
    error: null,
  })
})

describe("POST /api/vendors/[vid]/documents — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB insert payload", async () => {
    const { documentCreateSchema } = await import("./_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const kitchenSink = {
      kind: "contract" as const,
      title: "Drift-Test Doc",
      external_url: "https://drift.example/doc.pdf",
      document_date: "2026-04-30",
      note: "Drift-Test note",
    }

    const schemaKeys = Object.keys(documentCreateSchema.shape)
    for (const key of schemaKeys) {
      expect(kitchenSink, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    docsChain.single.mockResolvedValue({
      data: { id: "drift-1", ...kitchenSink, tenant_id: TENANT_ID },
      error: null,
    })

    const res = await POST(
      new Request(`http://localhost/api/vendors/${VENDOR_ID}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kitchenSink),
      }),
      { params: Promise.resolve({ vid: VENDOR_ID }) }
    )
    expect(res.status).toBe(201)

    const arg = docsChain.insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg, "insert was not called").toBeTruthy()

    for (const key of schemaKeys) {
      const expected = (kitchenSink as Record<string, unknown>)[key]
      const actual = arg[key]
      // kind is enum (no trim); document_date is YYYY-MM-DD (no trim);
      // title/external_url/note are trimmed.
      if (
        typeof expected === "string" &&
        (key === "title" || key === "external_url" || key === "note")
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
    expect(arg.vendor_id).toBe(VENDOR_ID)
    expect(arg.created_by).toBe(USER_ID)
  })
})
