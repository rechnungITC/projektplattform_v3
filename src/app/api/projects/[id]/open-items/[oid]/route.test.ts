import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-20 — single-open-item endpoint tests for /api/projects/[id]/open-items/[oid].

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

const openItemChain = {
  select: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
  then: undefined as unknown as (resolve: (v: unknown) => void) => void,
  __deleteResult: { error: null as { code?: string; message: string } | null },
}

openItemChain.then = (resolve: (v: unknown) => void) =>
  resolve(openItemChain.__deleteResult)

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "project_memberships") return projectMembershipChain
  if (table === "open_items") return openItemChain
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
const OPEN_ITEM_ID = "44444444-4444-4444-8444-444444444444"
const USER_ID = "33333333-3333-4333-8333-333333333333"

beforeEach(() => {
  vi.clearAllMocks()
  projectChain.select.mockReturnValue(projectChain)
  projectChain.eq.mockReturnValue(projectChain)
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  projectMembershipChain.select.mockReturnValue(projectMembershipChain)
  projectMembershipChain.eq.mockReturnValue(projectMembershipChain)
  openItemChain.select.mockReturnValue(openItemChain)
  openItemChain.update.mockReturnValue(openItemChain)
  openItemChain.delete.mockReturnValue(openItemChain)
  openItemChain.eq.mockReturnValue(openItemChain)
  openItemChain.__deleteResult = { error: null }

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
describe("PATCH /api/projects/[id]/open-items/[oid] — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB update payload", async () => {
    const { openItemPatchSchema } = await import("../_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    // patchSchema is wrapped in .refine() — unwrap via _def.schema.shape.
    const inner =
      "shape" in openItemPatchSchema
        ? (openItemPatchSchema as unknown as { shape: Record<string, unknown> })
        : (
            openItemPatchSchema as unknown as {
              _def: { schema: { shape: Record<string, unknown> } }
            }
          )._def.schema
    const schemaKeys = Object.keys(
      (inner as { shape: Record<string, unknown> }).shape
    )

    const STAKEHOLDER_ID = "66666666-6666-4666-8666-666666666666"
    const kitchenSink: Record<string, unknown> = {
      title: "Drift-Test Open Item",
      description: "Updated description.",
      status: "in_clarification",
      contact: "external@example.com",
      contact_stakeholder_id: STAKEHOLDER_ID,
    }

    for (const key of schemaKeys) {
      expect(kitchenSink, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    // PATCH does an existence-lookup first to refuse already-converted items.
    openItemChain.maybeSingle.mockResolvedValue({
      data: { status: "open" },
      error: null,
    })
    openItemChain.single.mockResolvedValue({
      data: { id: OPEN_ITEM_ID, ...kitchenSink, tenant_id: TENANT_ID },
      error: null,
    })

    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kitchenSink),
      }),
      { params: Promise.resolve({ id: PROJECT_ID, oid: OPEN_ITEM_ID }) }
    )
    expect(res.status).toBe(200)

    const arg = openItemChain.update.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(arg, "update was not called").toBeTruthy()

    for (const key of schemaKeys) {
      const expected = kitchenSink[key]
      const actual = arg[key]
      if (typeof expected === "string") {
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
