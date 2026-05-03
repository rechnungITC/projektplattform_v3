import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-13 — single-outbox PATCH drift-detection test.

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

const outboxChain = {
  select: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "project_memberships") return projectMembershipChain
  if (table === "communication_outbox") return outboxChain
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
const USER_ID = "33333333-3333-4333-8333-333333333333"
const OUTBOX_ID = "44444444-4444-4444-8444-444444444444"

beforeEach(() => {
  vi.clearAllMocks()
  projectChain.select.mockReturnValue(projectChain)
  projectChain.eq.mockReturnValue(projectChain)
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  projectMembershipChain.select.mockReturnValue(projectMembershipChain)
  projectMembershipChain.eq.mockReturnValue(projectMembershipChain)
  outboxChain.select.mockReturnValue(outboxChain)
  outboxChain.update.mockReturnValue(outboxChain)
  outboxChain.eq.mockReturnValue(outboxChain)

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

// ---------------------------------------------------------------------------
// Schema-vs-DB-Payload Drift Detection (PATCH)
// ---------------------------------------------------------------------------
describe("PATCH /api/projects/[id]/communication/outbox/[oid] — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB update payload", async () => {
    const { outboxPatchSchema } = await import("../_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    // patchSchema is wrapped in .refine() — unwrap via _def.schema.shape.
    const inner =
      "shape" in outboxPatchSchema
        ? (outboxPatchSchema as unknown as { shape: Record<string, unknown> })
        : (
            outboxPatchSchema as unknown as {
              _def: { schema: { shape: Record<string, unknown> } }
            }
          )._def.schema
    const schemaKeys = Object.keys(
      (inner as { shape: Record<string, unknown> }).shape
    )

    const kitchenSink: Record<string, unknown> = {
      channel: "email",
      recipient: "updated@example.com",
      subject: "Updated Subject",
      body: "Updated body content.",
      metadata: { trace_id: "xyz-789" },
    }

    for (const key of schemaKeys) {
      expect(kitchenSink, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    // PATCH does an existence-lookup first (refuse non-draft).
    outboxChain.maybeSingle.mockResolvedValue({
      data: { status: "draft" },
      error: null,
    })
    outboxChain.single.mockResolvedValue({
      data: { id: OUTBOX_ID, ...kitchenSink, tenant_id: TENANT_ID },
      error: null,
    })

    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kitchenSink),
      }),
      { params: Promise.resolve({ id: PROJECT_ID, oid: OUTBOX_ID }) }
    )
    expect(res.status).toBe(200)

    const arg = outboxChain.update.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg, "update was not called").toBeTruthy()

    for (const key of schemaKeys) {
      const expected = kitchenSink[key]
      const actual = arg[key]
      // recipient + subject are trimmed; body is NOT trimmed; metadata is JSONB.
      if (
        typeof expected === "string" &&
        (key === "recipient" || key === "subject")
      ) {
        expect(actual, `field '${key}' was dropped before reaching DB`).toBe(
          expected.trim() || null
        )
      } else if (
        expected &&
        typeof expected === "object" &&
        !Array.isArray(expected)
      ) {
        expect(actual, `field '${key}' was dropped before reaching DB`).toEqual(
          expected
        )
      } else {
        expect(actual, `field '${key}' was dropped before reaching DB`).toBe(
          expected
        )
      }
    }
  })
})
