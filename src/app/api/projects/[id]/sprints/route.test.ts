import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-26 — method-gating regression for the sprint create endpoint.
// Covers: happy path (scrum), 422 on disallowed method (waterfall), and
// the NULL-method bypass (project still in setup).

const getUserMock = vi.fn()

const projectChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const sprintInsertChain = {
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "sprints") return sprintInsertChain
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
    request: new Request(`http://localhost/api/projects/${projectId}/sprints`, {
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
  sprintInsertChain.insert.mockReturnValue(sprintInsertChain)
  sprintInsertChain.select.mockReturnValue(sprintInsertChain)
})

describe("POST /api/projects/[id]/sprints — PROJ-26 method-gating", () => {
  it("creates the sprint when project method is scrum (happy path)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    projectChain.maybeSingle.mockResolvedValue({
      data: { tenant_id: TENANT_ID, project_method: "scrum" },
      error: null,
    })
    sprintInsertChain.single.mockResolvedValue({
      data: { id: "sprint-1", name: "Sprint 1" },
      error: null,
    })

    const { request, context } = makePost({ name: "Sprint 1" })
    const res = await POST(request, context)

    expect(res.status).toBe(201)
    const body = (await res.json()) as { sprint: { id: string } }
    expect(body.sprint.id).toBe("sprint-1")
    expect(sprintInsertChain.insert).toHaveBeenCalledTimes(1)
  })

  it("rejects with 422 when project method is waterfall", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    projectChain.maybeSingle.mockResolvedValue({
      data: { tenant_id: TENANT_ID, project_method: "waterfall" },
      error: null,
    })

    const { request, context } = makePost({ name: "Sprint 1" })
    const res = await POST(request, context)

    expect(res.status).toBe(422)
    const body = (await res.json()) as {
      error: { code: string; message: string; field?: string }
    }
    expect(body.error.code).toBe("schedule_construct_not_allowed_in_method")
    expect(body.error.field).toBe("project_method")
    expect(body.error.message).toContain("WATERFALL")
    expect(body.error.message).toContain("Sub-Projekt")
    // Insert must never be reached.
    expect(sprintInsertChain.insert).not.toHaveBeenCalled()
  })

  it("rejects with 422 when project method is kanban", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    projectChain.maybeSingle.mockResolvedValue({
      data: { tenant_id: TENANT_ID, project_method: "kanban" },
      error: null,
    })

    const { request, context } = makePost({ name: "Sprint 1" })
    const res = await POST(request, context)

    expect(res.status).toBe(422)
    expect(sprintInsertChain.insert).not.toHaveBeenCalled()
  })

  it("allows the sprint when project method is NULL (setup phase)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    projectChain.maybeSingle.mockResolvedValue({
      data: { tenant_id: TENANT_ID, project_method: null },
      error: null,
    })
    sprintInsertChain.single.mockResolvedValue({
      data: { id: "sprint-1", name: "Sprint 1" },
      error: null,
    })

    const { request, context } = makePost({ name: "Sprint 1" })
    const res = await POST(request, context)

    expect(res.status).toBe(201)
    expect(sprintInsertChain.insert).toHaveBeenCalledTimes(1)
  })

  it("returns 401 when no session", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const { request, context } = makePost({ name: "Sprint 1" })
    const res = await POST(request, context)
    expect(res.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// Schema-vs-DB-Payload Drift Detection (POST)
// ---------------------------------------------------------------------------
describe("POST /api/projects/[id]/sprints — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB insert payload", async () => {
    const { sprintCreateSchema } = await import("./_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    projectChain.maybeSingle.mockResolvedValue({
      data: { tenant_id: TENANT_ID, project_method: "scrum" },
      error: null,
    })

    // createSchema is wrapped in .refine() — unwrap via _def.schema.shape.
    const inner =
      "shape" in sprintCreateSchema
        ? (sprintCreateSchema as unknown as { shape: Record<string, unknown> })
        : (
            sprintCreateSchema as unknown as {
              _def: { schema: { shape: Record<string, unknown> } }
            }
          )._def.schema
    const schemaKeys = Object.keys(
      (inner as { shape: Record<string, unknown> }).shape
    )

    const kitchenSink = {
      name: "Drift-Test Sprint",
      goal: "Drift-Test goal description.",
      start_date: "2026-01-01",
      end_date: "2026-01-14",
      is_critical: false,
    }

    for (const key of schemaKeys) {
      expect(kitchenSink, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    sprintInsertChain.single.mockResolvedValue({
      data: { id: "drift-1", ...kitchenSink },
      error: null,
    })

    const { request, context } = makePost(kitchenSink)
    const res = await POST(request, context)
    expect(res.status).toBe(201)

    const arg = sprintInsertChain.insert.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(arg, "insert was not called").toBeTruthy()

    for (const key of schemaKeys) {
      const expected = (kitchenSink as Record<string, unknown>)[key]
      const actual = arg[key]
      // start_date / end_date are YYYY-MM-DD (not trimmed); only name + goal trim.
      if (typeof expected === "string" && (key === "name" || key === "goal")) {
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
