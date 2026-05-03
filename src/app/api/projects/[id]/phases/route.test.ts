import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-26 — method-gating regression for the phase create endpoint.
// Covers: happy path (waterfall), 422 on disallowed method (scrum), and
// the NULL-method bypass.

const getUserMock = vi.fn()

const projectChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

// Single chain that supports both call paths the route takes:
//   1) .select("sequence_number").eq().eq().order().limit().maybeSingle()  (auto-seq lookup)
//   2) .insert(...).select().single()                                       (the actual insert)
// Both pathways share the same chain object via mockReturnThis(); they
// differ only in the terminal call (`maybeSingle` vs `single`).
const phasesChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
  insert: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "phases") return phasesChain
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { POST } from "./route"

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const TENANT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"

function makePost(body: unknown, projectId = PROJECT_ID): {
  request: Request
  context: { params: Promise<{ id: string }> }
} {
  return {
    request: new Request(`http://localhost/api/projects/${projectId}/phases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    context: { params: Promise.resolve({ id: projectId }) },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  projectChain.select.mockReturnValue(projectChain)
  projectChain.eq.mockReturnValue(projectChain)
  phasesChain.select.mockReturnValue(phasesChain)
  phasesChain.eq.mockReturnValue(phasesChain)
  phasesChain.order.mockReturnValue(phasesChain)
  phasesChain.limit.mockReturnValue(phasesChain)
  phasesChain.insert.mockReturnValue(phasesChain)
  // No existing rows → seq starts at 1.
  phasesChain.maybeSingle.mockResolvedValue({ data: null, error: null })
})

describe("POST /api/projects/[id]/phases — PROJ-26 method-gating", () => {
  it("creates the phase when project method is waterfall (happy path)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    projectChain.maybeSingle.mockResolvedValue({
      data: { tenant_id: TENANT_ID, project_method: "waterfall" },
      error: null,
    })
    phasesChain.single.mockResolvedValue({
      data: { id: "phase-1", name: "Init", sequence_number: 1 },
      error: null,
    })

    const { request, context } = makePost({ name: "Init" })
    const res = await POST(request, context)

    expect(res.status).toBe(201)
    const body = (await res.json()) as { phase: { id: string } }
    expect(body.phase.id).toBe("phase-1")
    expect(phasesChain.insert).toHaveBeenCalledTimes(1)
  })

  it("rejects with 422 when project method is scrum", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    projectChain.maybeSingle.mockResolvedValue({
      data: { tenant_id: TENANT_ID, project_method: "scrum" },
      error: null,
    })

    const { request, context } = makePost({ name: "Init" })
    const res = await POST(request, context)

    expect(res.status).toBe(422)
    const body = (await res.json()) as {
      error: { code: string; message: string; field?: string }
    }
    expect(body.error.code).toBe("schedule_construct_not_allowed_in_method")
    expect(body.error.field).toBe("project_method")
    expect(body.error.message).toContain("SCRUM")
    expect(phasesChain.insert).not.toHaveBeenCalled()
  })

  it("rejects with 422 when project method is safe", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    projectChain.maybeSingle.mockResolvedValue({
      data: { tenant_id: TENANT_ID, project_method: "safe" },
      error: null,
    })

    const { request, context } = makePost({ name: "Init" })
    const res = await POST(request, context)

    expect(res.status).toBe(422)
    expect(phasesChain.insert).not.toHaveBeenCalled()
  })

  it("allows the phase when project method is NULL (setup phase)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    projectChain.maybeSingle.mockResolvedValue({
      data: { tenant_id: TENANT_ID, project_method: null },
      error: null,
    })
    phasesChain.single.mockResolvedValue({
      data: { id: "phase-1", name: "Init", sequence_number: 1 },
      error: null,
    })

    const { request, context } = makePost({ name: "Init" })
    const res = await POST(request, context)

    expect(res.status).toBe(201)
    expect(phasesChain.insert).toHaveBeenCalledTimes(1)
  })

  it("returns 401 when no session", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const { request, context } = makePost({ name: "Init" })
    const res = await POST(request, context)
    expect(res.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// Schema-vs-DB-Payload Drift Detection (POST)
// ---------------------------------------------------------------------------
describe("POST /api/projects/[id]/phases — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB insert payload", async () => {
    const { phaseCreateSchema } = await import("./_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    projectChain.maybeSingle.mockResolvedValue({
      data: { tenant_id: TENANT_ID, project_method: "waterfall" },
      error: null,
    })
    // Auto-seq lookup returns no row → seq becomes 1 (overridden by explicit 5).
    phasesChain.maybeSingle.mockResolvedValue({ data: null, error: null })

    // createSchema is wrapped in .refine() — unwrap via _def.schema.shape.
    const inner =
      "shape" in phaseCreateSchema
        ? (phaseCreateSchema as unknown as { shape: Record<string, unknown> })
        : (
            phaseCreateSchema as unknown as {
              _def: { schema: { shape: Record<string, unknown> } }
            }
          )._def.schema
    const schemaKeys = Object.keys(
      (inner as { shape: Record<string, unknown> }).shape
    )

    const kitchenSink = {
      name: "Drift-Test Phase",
      description: "Drift-Test description.",
      planned_start: "2026-01-01",
      planned_end: "2026-12-31",
      sequence_number: 5,
    }

    for (const key of schemaKeys) {
      expect(kitchenSink, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    phasesChain.single.mockResolvedValue({
      data: { id: "drift-1", ...kitchenSink },
      error: null,
    })

    const { request, context } = makePost(kitchenSink)
    const res = await POST(request, context)
    expect(res.status).toBe(201)

    const arg = phasesChain.insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg, "insert was not called").toBeTruthy()

    for (const key of schemaKeys) {
      const expected = (kitchenSink as Record<string, unknown>)[key]
      const actual = arg[key]
      // Dates are YYYY-MM-DD; sequence_number is number; only name+description trim.
      if (typeof expected === "string" && key === "name") {
        expect(actual, `field '${key}' was dropped before reaching DB`).toBe(
          expected.trim() || null
        )
      } else if (typeof expected === "string" && key === "description") {
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
    expect(arg.project_id).toBe(PROJECT_ID)
    expect(arg.created_by).toBe(USER_ID)
  })
})
