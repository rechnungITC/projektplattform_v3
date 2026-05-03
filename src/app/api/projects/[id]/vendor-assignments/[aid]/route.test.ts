import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-15 — single vendor-assignment PATCH drift-detection test.

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

const updateChain = {
  select: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "project_memberships") return projectMembershipChain
  if (table === "vendor_project_assignments") return updateChain
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
const VENDOR_ID = "44444444-4444-4444-8444-444444444444"
const ASSIGNMENT_ID = "55555555-5555-4555-8555-555555555555"

beforeEach(() => {
  vi.clearAllMocks()
  projectChain.select.mockReturnValue(projectChain)
  projectChain.eq.mockReturnValue(projectChain)
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  projectMembershipChain.select.mockReturnValue(projectMembershipChain)
  projectMembershipChain.eq.mockReturnValue(projectMembershipChain)
  updateChain.select.mockReturnValue(updateChain)
  updateChain.update.mockReturnValue(updateChain)
  updateChain.eq.mockReturnValue(updateChain)

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
// patchSchema chains TWO `.refine()` calls — unwrap both layers.
function unwrapShape(schema: unknown): Record<string, unknown> {
  let inner = schema as { shape?: Record<string, unknown>; _def?: { schema?: unknown } }
  while (!inner.shape && inner._def?.schema) {
    inner = inner._def.schema as typeof inner
  }
  return (inner.shape ?? {}) as Record<string, unknown>
}

describe("PATCH /api/projects/[id]/vendor-assignments/[aid] — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB update payload", async () => {
    const { vendorAssignmentPatchSchema } = await import("../_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const schemaKeys = Object.keys(unwrapShape(vendorAssignmentPatchSchema))

    const kitchenSink: Record<string, unknown> = {
      role: "lieferant",
      scope_note: "Updated scope",
      valid_from: "2026-01-01",
      valid_until: "2026-12-31",
    }

    for (const key of schemaKeys) {
      expect(kitchenSink, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    updateChain.single.mockResolvedValue({
      data: {
        id: ASSIGNMENT_ID,
        tenant_id: TENANT_ID,
        project_id: PROJECT_ID,
        vendor_id: VENDOR_ID,
        ...kitchenSink,
        created_by: USER_ID,
        created_at: "2026-04-30T00:00:00Z",
        updated_at: "2026-04-30T00:00:00Z",
        vendors: { name: "Drift Inc." },
      },
      error: null,
    })

    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kitchenSink),
      }),
      { params: Promise.resolve({ id: PROJECT_ID, aid: ASSIGNMENT_ID }) }
    )
    expect(res.status).toBe(200)

    const arg = updateChain.update.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg, "update was not called").toBeTruthy()

    for (const key of schemaKeys) {
      const expected = kitchenSink[key]
      const actual = arg[key]
      // valid_from / valid_until are YYYY-MM-DD — not trimmed. role is enum.
      if (typeof expected === "string" && key === "scope_note") {
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
