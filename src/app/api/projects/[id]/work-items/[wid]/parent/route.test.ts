import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-59α — parent route hardening for Jira-like Scrum hierarchy DnD.
// The UI will call this route when a Task is dropped on a Story; these tests
// lock down the route-level edit permission and parent-kind guard rails.

const getUserMock = vi.fn()

const projectsChain = {
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

const childChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const parentChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const updateChain = {
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectsChain
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "project_memberships") return projectMembershipChain
  if (table === "work_items") {
    const router = {
      select: (columns: string) => {
        if (columns.includes("is_deleted")) {
          parentChain.select(columns)
          return parentChain
        }
        childChain.select(columns)
        return childChain
      },
      update: (payload: Record<string, unknown>) => {
        updateChain.update(payload)
        return updateChain
      },
    }
    return router
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

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const OTHER_PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const WORK_ITEM_ID = "33333333-3333-4333-8333-333333333333"
const STORY_ID = "44444444-4444-4444-8444-444444444444"
const TASK_ID = WORK_ITEM_ID
const TASK_PARENT_ID = "77777777-7777-4777-8777-777777777777"
const USER_ID = "55555555-5555-4555-8555-555555555555"
const TENANT_ID = "66666666-6666-4666-8666-666666666666"

function makeReq(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/work-items/${WORK_ITEM_ID}/parent`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
}

function makeCtx(wid = WORK_ITEM_ID) {
  return {
    params: Promise.resolve({ id: PROJECT_ID, wid }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()

  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

  projectsChain.select.mockReturnValue(projectsChain)
  projectsChain.eq.mockReturnValue(projectsChain)
  projectsChain.maybeSingle.mockResolvedValue({
    data: { id: PROJECT_ID, tenant_id: TENANT_ID },
    error: null,
  })

  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.maybeSingle.mockResolvedValue({
    data: { role: "admin" },
    error: null,
  })

  projectMembershipChain.select.mockReturnValue(projectMembershipChain)
  projectMembershipChain.eq.mockReturnValue(projectMembershipChain)
  projectMembershipChain.maybeSingle.mockResolvedValue({
    data: { role: "lead" },
    error: null,
  })

  childChain.select.mockReturnValue(childChain)
  childChain.eq.mockReturnValue(childChain)
  childChain.maybeSingle.mockResolvedValue({
    data: { id: TASK_ID, kind: "task", project_id: PROJECT_ID },
    error: null,
  })

  parentChain.select.mockReturnValue(parentChain)
  parentChain.eq.mockReturnValue(parentChain)
  parentChain.maybeSingle.mockResolvedValue({
    data: { id: STORY_ID, kind: "story", project_id: PROJECT_ID, is_deleted: false },
    error: null,
  })

  updateChain.update.mockReturnValue(updateChain)
  updateChain.eq.mockReturnValue(updateChain)
  updateChain.select.mockReturnValue(updateChain)
  updateChain.maybeSingle.mockResolvedValue({
    data: { id: TASK_ID, kind: "task", parent_id: STORY_ID },
    error: null,
  })
})

describe("PATCH /api/projects/[id]/work-items/[wid]/parent — PROJ-59α", () => {
  it("requires a signed-in user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })

    const res = await PATCH(makeReq({ parent_id: STORY_ID }), makeCtx())

    expect(res.status).toBe(401)
    expect(projectsChain.select).not.toHaveBeenCalled()
    expect(updateChain.update).not.toHaveBeenCalled()
  })

  it("requires project edit access before reading or updating work items", async () => {
    tenantMembershipChain.maybeSingle.mockResolvedValue({
      data: { role: "member" },
      error: null,
    })
    projectMembershipChain.maybeSingle.mockResolvedValue({
      data: { role: "viewer" },
      error: null,
    })

    const res = await PATCH(makeReq({ parent_id: STORY_ID }), makeCtx())

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe("forbidden")
    expect(childChain.select).not.toHaveBeenCalled()
    expect(updateChain.update).not.toHaveBeenCalled()
  })

  it("allows task -> story re-parenting", async () => {
    const res = await PATCH(makeReq({ parent_id: STORY_ID }), makeCtx())

    expect(res.status).toBe(200)
    expect(updateChain.update).toHaveBeenCalledWith({ parent_id: STORY_ID })
  })

  it("allows task -> top-level when parent_id is null", async () => {
    updateChain.maybeSingle.mockResolvedValue({
      data: { id: TASK_ID, kind: "task", parent_id: null },
      error: null,
    })

    const res = await PATCH(makeReq({ parent_id: null }), makeCtx())

    expect(res.status).toBe(200)
    expect(parentChain.select).not.toHaveBeenCalled()
    expect(updateChain.update).toHaveBeenCalledWith({ parent_id: null })
  })

  it("allows subtask -> task re-parenting", async () => {
    childChain.maybeSingle.mockResolvedValue({
      data: { id: WORK_ITEM_ID, kind: "subtask", project_id: PROJECT_ID },
      error: null,
    })
    parentChain.maybeSingle.mockResolvedValue({
      data: {
        id: TASK_PARENT_ID,
        kind: "task",
        project_id: PROJECT_ID,
        is_deleted: false,
      },
      error: null,
    })

    const res = await PATCH(makeReq({ parent_id: TASK_PARENT_ID }), makeCtx())

    expect(res.status).toBe(200)
    expect(updateChain.update).toHaveBeenCalledWith({ parent_id: TASK_PARENT_ID })
  })

  it("rejects invalid parent kind before update", async () => {
    parentChain.maybeSingle.mockResolvedValue({
      data: { id: STORY_ID, kind: "epic", project_id: PROJECT_ID, is_deleted: false },
      error: null,
    })

    const res = await PATCH(makeReq({ parent_id: STORY_ID }), makeCtx())

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("invalid_parent_kind")
    expect(body.error.field).toBe("parent_id")
    expect(updateChain.update).not.toHaveBeenCalled()
  })

  it("rejects self-parenting before parent lookup", async () => {
    const res = await PATCH(makeReq({ parent_id: WORK_ITEM_ID }), makeCtx())

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("invalid_parent")
    expect(parentChain.select).not.toHaveBeenCalled()
    expect(updateChain.update).not.toHaveBeenCalled()
  })

  it("rejects parent from another project before update", async () => {
    parentChain.maybeSingle.mockResolvedValue({
      data: {
        id: STORY_ID,
        kind: "story",
        project_id: OTHER_PROJECT_ID,
        is_deleted: false,
      },
      error: null,
    })

    const res = await PATCH(makeReq({ parent_id: STORY_ID }), makeCtx())

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("invalid_parent")
    expect(updateChain.update).not.toHaveBeenCalled()
  })

  it("surfaces cycle prevention as cycle_detected", async () => {
    updateChain.maybeSingle.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "cycle detected" },
    })

    const res = await PATCH(makeReq({ parent_id: STORY_ID }), makeCtx())

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("cycle_detected")
    expect(body.error.field).toBe("parent_id")
  })
})
