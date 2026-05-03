import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-20 — single-risk endpoint tests for /api/projects/[id]/risks/[rid].

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

const riskChain = {
  select: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
  then: undefined as unknown as (resolve: (v: unknown) => void) => void,
  __deleteResult: { error: null as { code?: string; message: string } | null },
}

riskChain.then = (resolve: (v: unknown) => void) => resolve(riskChain.__deleteResult)

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "project_memberships") return projectMembershipChain
  if (table === "risks") return riskChain
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

import { DELETE, GET, PATCH } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const RISK_ID = "44444444-4444-4444-8444-444444444444"
const USER_ID = "33333333-3333-4333-8333-333333333333"

beforeEach(() => {
  vi.clearAllMocks()
  projectChain.select.mockReturnValue(projectChain)
  projectChain.eq.mockReturnValue(projectChain)
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  projectMembershipChain.select.mockReturnValue(projectMembershipChain)
  projectMembershipChain.eq.mockReturnValue(projectMembershipChain)
  riskChain.select.mockReturnValue(riskChain)
  riskChain.update.mockReturnValue(riskChain)
  riskChain.delete.mockReturnValue(riskChain)
  riskChain.eq.mockReturnValue(riskChain)
  riskChain.__deleteResult = { error: null }

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

describe("GET /api/projects/[id]/risks/[rid]", () => {
  it("returns 400 on bad UUID", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: PROJECT_ID, rid: "not-a-uuid" }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 404 when not found", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    riskChain.maybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: PROJECT_ID, rid: RISK_ID }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 200 with risk row", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    riskChain.maybeSingle.mockResolvedValue({
      data: { id: RISK_ID, project_id: PROJECT_ID, title: "X", score: 6 },
      error: null,
    })
    const res = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: PROJECT_ID, rid: RISK_ID }),
    })
    expect(res.status).toBe(200)
  })
})

describe("PATCH /api/projects/[id]/risks/[rid]", () => {
  it("returns 400 on empty body", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: PROJECT_ID, rid: RISK_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it("returns 200 on successful update", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    riskChain.single.mockResolvedValue({
      data: {
        id: RISK_ID,
        project_id: PROJECT_ID,
        title: "Updated",
        score: 16,
      },
      error: null,
    })
    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "mitigated" }),
      }),
      { params: Promise.resolve({ id: PROJECT_ID, rid: RISK_ID }) }
    )
    expect(res.status).toBe(200)
  })
})

describe("DELETE /api/projects/[id]/risks/[rid]", () => {
  it("returns 204 on successful delete", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    riskChain.__deleteResult = { error: null }
    const res = await DELETE(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: PROJECT_ID, rid: RISK_ID }),
    })
    expect(res.status).toBe(204)
  })

  it("returns 403 on RLS block (42501)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    riskChain.__deleteResult = { error: { code: "42501", message: "denied" } }
    const res = await DELETE(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: PROJECT_ID, rid: RISK_ID }),
    })
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// Schema-vs-DB-Payload Drift Detection (PATCH)
// ---------------------------------------------------------------------------
describe("PATCH /api/projects/[id]/risks/[rid] — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB update payload", async () => {
    const { riskPatchSchema } = await import("../_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    // patchSchema is wrapped in .refine() — unwrap via _def.schema.shape.
    const inner =
      "shape" in riskPatchSchema
        ? (riskPatchSchema as unknown as { shape: Record<string, unknown> })
        : (
            riskPatchSchema as unknown as {
              _def: { schema: { shape: Record<string, unknown> } }
            }
          )._def.schema
    const schemaKeys = Object.keys(
      (inner as { shape: Record<string, unknown> }).shape
    )

    const kitchenSink: Record<string, unknown> = {
      title: "Drift-Test Risk",
      description: "Updated risk description.",
      probability: 5,
      impact: 4,
      status: "mitigated",
      mitigation: "Updated mitigation plan.",
      responsible_user_id: USER_ID,
    }

    for (const key of schemaKeys) {
      expect(kitchenSink, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    riskChain.maybeSingle.mockResolvedValue({
      data: { id: RISK_ID, project_id: PROJECT_ID },
      error: null,
    })
    riskChain.single.mockResolvedValue({
      data: { id: RISK_ID, ...kitchenSink, tenant_id: TENANT_ID },
      error: null,
    })

    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kitchenSink),
      }),
      { params: Promise.resolve({ id: PROJECT_ID, rid: RISK_ID }) }
    )
    expect(res.status).toBe(200)

    const arg = riskChain.update.mock.calls[0]?.[0] as Record<string, unknown>
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
