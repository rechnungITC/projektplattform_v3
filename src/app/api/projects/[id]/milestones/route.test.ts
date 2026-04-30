import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-26 — method-gating regression for the milestone create endpoint.

const getUserMock = vi.fn()

const projectChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const milestoneInsertChain = {
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "milestones") return milestoneInsertChain
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
    request: new Request(
      `http://localhost/api/projects/${projectId}/milestones`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    ),
    context: { params: Promise.resolve({ id: projectId }) },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  projectChain.select.mockReturnValue(projectChain)
  projectChain.eq.mockReturnValue(projectChain)
  milestoneInsertChain.insert.mockReturnValue(milestoneInsertChain)
  milestoneInsertChain.select.mockReturnValue(milestoneInsertChain)
})

describe("POST /api/projects/[id]/milestones — PROJ-26 method-gating", () => {
  it("creates the milestone when project method is pmi (happy path)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    projectChain.maybeSingle.mockResolvedValue({
      data: { tenant_id: TENANT_ID, project_method: "pmi" },
      error: null,
    })
    milestoneInsertChain.single.mockResolvedValue({
      data: { id: "ms-1", name: "Go-Live", target_date: "2026-12-31" },
      error: null,
    })

    const { request, context } = makePost({
      name: "Go-Live",
      target_date: "2026-12-31",
    })
    const res = await POST(request, context)

    expect(res.status).toBe(201)
    const body = (await res.json()) as { milestone: { id: string } }
    expect(body.milestone.id).toBe("ms-1")
    expect(milestoneInsertChain.insert).toHaveBeenCalledTimes(1)
  })

  it("rejects with 422 when project method is kanban", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    projectChain.maybeSingle.mockResolvedValue({
      data: { tenant_id: TENANT_ID, project_method: "kanban" },
      error: null,
    })

    const { request, context } = makePost({
      name: "Go-Live",
      target_date: "2026-12-31",
    })
    const res = await POST(request, context)

    expect(res.status).toBe(422)
    const body = (await res.json()) as {
      error: { code: string; message: string; field?: string }
    }
    expect(body.error.code).toBe("schedule_construct_not_allowed_in_method")
    expect(body.error.field).toBe("project_method")
    expect(body.error.message).toContain("KANBAN")
    expect(milestoneInsertChain.insert).not.toHaveBeenCalled()
  })

  it("rejects with 422 when project method is scrum", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    projectChain.maybeSingle.mockResolvedValue({
      data: { tenant_id: TENANT_ID, project_method: "scrum" },
      error: null,
    })

    const { request, context } = makePost({
      name: "Go-Live",
      target_date: "2026-12-31",
    })
    const res = await POST(request, context)

    expect(res.status).toBe(422)
    expect(milestoneInsertChain.insert).not.toHaveBeenCalled()
  })

  it("allows the milestone when project method is NULL (setup phase)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    projectChain.maybeSingle.mockResolvedValue({
      data: { tenant_id: TENANT_ID, project_method: null },
      error: null,
    })
    milestoneInsertChain.single.mockResolvedValue({
      data: { id: "ms-1", name: "Go-Live", target_date: "2026-12-31" },
      error: null,
    })

    const { request, context } = makePost({
      name: "Go-Live",
      target_date: "2026-12-31",
    })
    const res = await POST(request, context)

    expect(res.status).toBe(201)
    expect(milestoneInsertChain.insert).toHaveBeenCalledTimes(1)
  })

  it("returns 401 when no session", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const { request, context } = makePost({
      name: "Go-Live",
      target_date: "2026-12-31",
    })
    const res = await POST(request, context)
    expect(res.status).toBe(401)
  })
})
