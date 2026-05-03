import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-9 — collection endpoint POST drift-detection test.

const getUserMock = vi.fn()

const projectChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const insertChain = {
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "work_items") return insertChain
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
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"

function makePost(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/work-items`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  projectChain.select.mockReturnValue(projectChain)
  projectChain.eq.mockReturnValue(projectChain)
  insertChain.insert.mockReturnValue(insertChain)
  insertChain.select.mockReturnValue(insertChain)

  // Default: project exists with no method (work_package allowed there).
  projectChain.maybeSingle.mockResolvedValue({
    data: { id: PROJECT_ID, tenant_id: TENANT_ID, project_method: null },
    error: null,
  })
})

// ---------------------------------------------------------------------------
// Schema-vs-DB-Payload Drift Detection (POST)
// ---------------------------------------------------------------------------
describe("POST /api/projects/[id]/work-items — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB insert payload", async () => {
    const { workItemCreateSchema } = await import("./_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const PROPOSAL_ID = "66666666-6666-4666-8666-666666666666"
    const PHASE_ID = "77777777-7777-4777-8777-777777777777"
    const SPRINT_ID = "88888888-8888-4888-8888-888888888888"
    const MILESTONE_ID = "99999999-9999-4999-8999-999999999999"

    const kitchenSink = {
      kind: "work_package",
      parent_id: null,
      phase_id: PHASE_ID,
      milestone_id: MILESTONE_ID,
      sprint_id: SPRINT_ID,
      title: "Drift-Test Item",
      description: "Drift-Test description.",
      status: "todo",
      priority: "high",
      responsible_user_id: USER_ID,
      attributes: { story_points: 5 },
      position: 100,
      created_from_proposal_id: PROPOSAL_ID,
    }

    const schemaKeys = Object.keys(workItemCreateSchema.shape)
    for (const key of schemaKeys) {
      expect(kitchenSink, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    insertChain.single.mockResolvedValue({
      data: { id: "drift-1", ...kitchenSink, tenant_id: TENANT_ID },
      error: null,
    })

    const res = await POST(makePost(kitchenSink), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(201)

    const arg = insertChain.insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg, "insert was not called").toBeTruthy()

    for (const key of schemaKeys) {
      const expected = (kitchenSink as Record<string, unknown>)[key]
      const actual = arg[key]
      if (typeof expected === "string") {
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

    expect(arg.tenant_id).toBe(TENANT_ID)
    expect(arg.project_id).toBe(PROJECT_ID)
    expect(arg.created_by).toBe(USER_ID)
  })
})
