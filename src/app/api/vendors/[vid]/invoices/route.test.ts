import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-15/22 — vendor invoices POST drift-detection.

const getUserMock = vi.fn()

const vendorChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const invoicesChain = {
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "vendors") return vendorChain
  if (table === "vendor_invoices") return invoicesChain
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
  vendorChain.select.mockReturnValue(vendorChain)
  vendorChain.eq.mockReturnValue(vendorChain)
  invoicesChain.insert.mockReturnValue(invoicesChain)
  invoicesChain.select.mockReturnValue(invoicesChain)
  vendorChain.maybeSingle.mockResolvedValue({
    data: { tenant_id: TENANT_ID },
    error: null,
  })
})

describe("POST /api/vendors/[vid]/invoices — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB insert payload", async () => {
    const { invoiceCreateSchema } = await import("./_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const kitchenSink = {
      invoice_number: "RE-2026-0001",
      invoice_date: "2026-04-30",
      gross_amount: 1234.56,
      currency: "EUR",
      project_id: null,
      file_storage_key: "vendor-invoices/RE-2026-0001.pdf",
      note: "Drift-Test note",
    }

    const schemaKeys = Object.keys(invoiceCreateSchema.shape)
    for (const key of schemaKeys) {
      expect(kitchenSink, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    invoicesChain.single.mockResolvedValue({
      data: { id: "drift-1", ...kitchenSink, tenant_id: TENANT_ID },
      error: null,
    })

    const res = await POST(
      new Request(`http://localhost/api/vendors/${VENDOR_ID}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kitchenSink),
      }),
      { params: Promise.resolve({ vid: VENDOR_ID }) }
    )
    expect(res.status).toBe(201)

    const arg = invoicesChain.insert.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(arg, "insert was not called").toBeTruthy()

    for (const key of schemaKeys) {
      const expected = (kitchenSink as Record<string, unknown>)[key]
      const actual = arg[key]
      // Only invoice_number is trimmed; date is YYYY-MM-DD; currency enum;
      // note + file_storage_key NOT trimmed (preserve verbatim).
      if (typeof expected === "string" && key === "invoice_number") {
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
