import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-8 — single-stakeholder endpoint tests for /api/projects/[id]/stakeholders/[sid].
// Includes the schema-vs-DB-update drift detection test.

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
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "project_memberships") return projectMembershipChain
  if (table === "stakeholders") return updateChain
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
const STAKEHOLDER_ID = "44444444-4444-4444-8444-444444444444"

function makePatch(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/stakeholders/${STAKEHOLDER_ID}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  projectChain.select.mockReturnValue(projectChain)
  projectChain.eq.mockReturnValue(projectChain)
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  projectMembershipChain.select.mockReturnValue(projectMembershipChain)
  projectMembershipChain.eq.mockReturnValue(projectMembershipChain)
  updateChain.update.mockReturnValue(updateChain)
  updateChain.eq.mockReturnValue(updateChain)
  updateChain.select.mockReturnValue(updateChain)

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

describe("PATCH /api/projects/[id]/stakeholders/[sid]", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makePatch({ name: "X" }), {
      params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 400 when no fields are provided", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PATCH(makePatch({}), {
      params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }),
    })
    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// Schema-vs-DB-Payload Drift Detection (PATCH)
// ---------------------------------------------------------------------------
describe("PATCH /api/projects/[id]/stakeholders/[sid] — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB update payload", async () => {
    const { stakeholderPatchSchema } = await import("../_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    // Kitchen-sink PATCH body. patchSchema wraps the object in a `.refine`
    // — we introspect the *inner* shape via `_def.schema.shape`.
    // (zod's ZodEffects exposes the underlying schema at `_def.schema`.)
    const inner =
      "shape" in stakeholderPatchSchema
        ? (stakeholderPatchSchema as unknown as { shape: Record<string, unknown> })
        : (
            stakeholderPatchSchema as unknown as {
              _def: { schema: { shape: Record<string, unknown> } }
            }
          )._def.schema

    const schemaKeys = Object.keys(
      (inner as { shape: Record<string, unknown> }).shape
    )

    const kitchenSink: Record<string, unknown> = {
      kind: "person",
      origin: "internal",
      name: "DriftTest",
      role_key: "drift-key",
      org_unit: "drift-unit",
      contact_email: "drift@example.com",
      contact_phone: "+49 30 123",
      influence: "high",
      impact: "high",
      linked_user_id: USER_ID,
      notes: "drift-notes",
      reasoning: "drift-reasoning",
      stakeholder_type_key: "promoter",
      management_level: "top",
      decision_authority: "deciding",
      attitude: "supportive",
      conflict_potential: "low",
      communication_need: "high",
      preferred_channel: "email",
      is_approver: true,
    }

    // Sanity: every schema key is in the kitchen sink.
    for (const key of schemaKeys) {
      expect(kitchenSink, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    updateChain.single.mockResolvedValue({
      data: { id: STAKEHOLDER_ID, ...kitchenSink, tenant_id: TENANT_ID },
      error: null,
    })
    const res = await PATCH(makePatch(kitchenSink), {
      params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }),
    })
    expect(res.status).toBe(200)

    const arg = updateChain.update.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg, "update was not called").toBeTruthy()

    // Every schema key MUST be present in the update payload.
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
