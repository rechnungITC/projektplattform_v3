import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-25b — single-item sprint route guards.
// We only cover the guards added/changed in this slice; the happy-path and
// validation lanes are exercised indirectly by the bulk-route test family
// (same patterns).

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

const sprintsChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const workItemsPreflightChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

const workItemsUpdateChain = {
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

let nextWorkItems: "preflight" | "update" = "preflight"

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectsChain
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "project_memberships") return projectMembershipChain
  if (table === "sprints") return sprintsChain
  if (table === "work_items") {
    if (nextWorkItems === "preflight") {
      nextWorkItems = "update"
      return workItemsPreflightChain
    }
    return workItemsUpdateChain
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
const SPRINT_ID = "44444444-4444-4444-8444-444444444444"
const USER_ID = "55555555-5555-4555-8555-555555555555"
const TENANT_ID = "66666666-6666-4666-8666-666666666666"

function makeReq(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/work-items/${WORK_ITEM_ID}/sprint`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  nextWorkItems = "preflight"
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
  sprintsChain.select.mockReturnValue(sprintsChain)
  sprintsChain.eq.mockReturnValue(sprintsChain)
  workItemsPreflightChain.select.mockReturnValue(workItemsPreflightChain)
  workItemsPreflightChain.eq.mockReturnValue(workItemsPreflightChain)
  workItemsPreflightChain.maybeSingle.mockResolvedValue({
    data: { id: WORK_ITEM_ID, kind: "story" },
    error: null,
  })
  workItemsUpdateChain.update.mockReturnValue(workItemsUpdateChain)
  workItemsUpdateChain.eq.mockReturnValue(workItemsUpdateChain)
  workItemsUpdateChain.select.mockReturnValue(workItemsUpdateChain)
  workItemsUpdateChain.maybeSingle.mockResolvedValue({
    data: { id: WORK_ITEM_ID, sprint_id: null },
    error: null,
  })
})

describe("PATCH /api/projects/[id]/work-items/[wid]/sprint — guards", () => {
  it("returns 422 sprint_closed when target sprint state = 'closed'", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    sprintsChain.maybeSingle.mockResolvedValue({
      data: { id: SPRINT_ID, project_id: PROJECT_ID, state: "closed" },
      error: null,
    })

    const res = await PATCH(makeReq({ sprint_id: SPRINT_ID }), {
      params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }),
    })

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("sprint_closed")
    expect(body.error.field).toBe("sprint_id")
    // Update must NOT have been called.
    expect(workItemsUpdateChain.update).not.toHaveBeenCalled()
  })

  it("returns 422 invalid_sprint when sprint belongs to another project", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    sprintsChain.maybeSingle.mockResolvedValue({
      data: { id: SPRINT_ID, project_id: OTHER_PROJECT_ID, state: "active" },
      error: null,
    })

    const res = await PATCH(makeReq({ sprint_id: SPRINT_ID }), {
      params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }),
    })

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("invalid_sprint")
    expect(workItemsUpdateChain.update).not.toHaveBeenCalled()
  })

  it("happy path: attaches story to active sprint", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    sprintsChain.maybeSingle.mockResolvedValue({
      data: { id: SPRINT_ID, project_id: PROJECT_ID, state: "active" },
      error: null,
    })
    workItemsPreflightChain.maybeSingle.mockResolvedValue({
      data: { id: WORK_ITEM_ID, kind: "story" },
      error: null,
    })
    workItemsUpdateChain.maybeSingle.mockResolvedValue({
      data: { id: WORK_ITEM_ID, sprint_id: SPRINT_ID },
      error: null,
    })

    const res = await PATCH(makeReq({ sprint_id: SPRINT_ID }), {
      params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }),
    })

    expect(res.status).toBe(200)
    expect(workItemsUpdateChain.update).toHaveBeenCalledWith({
      sprint_id: SPRINT_ID,
    })
  })

  it("happy path: attaches task to active sprint", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    sprintsChain.maybeSingle.mockResolvedValue({
      data: { id: SPRINT_ID, project_id: PROJECT_ID, state: "active" },
      error: null,
    })
    workItemsPreflightChain.maybeSingle.mockResolvedValue({
      data: { id: WORK_ITEM_ID, kind: "task" },
      error: null,
    })
    workItemsUpdateChain.maybeSingle.mockResolvedValue({
      data: { id: WORK_ITEM_ID, sprint_id: SPRINT_ID },
      error: null,
    })

    const res = await PATCH(makeReq({ sprint_id: SPRINT_ID }), {
      params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }),
    })

    expect(res.status).toBe(200)
    expect(workItemsUpdateChain.update).toHaveBeenCalledWith({
      sprint_id: SPRINT_ID,
    })
  })

  it("returns 422 invalid_kind when work item is not sprint-assignable", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    sprintsChain.maybeSingle.mockResolvedValue({
      data: { id: SPRINT_ID, project_id: PROJECT_ID, state: "active" },
      error: null,
    })
    workItemsPreflightChain.maybeSingle.mockResolvedValue({
      data: { id: WORK_ITEM_ID, kind: "epic" },
      error: null,
    })

    const res = await PATCH(makeReq({ sprint_id: SPRINT_ID }), {
      params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }),
    })

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("invalid_kind")
    expect(body.error.field).toBe("wid")
    expect(workItemsUpdateChain.update).not.toHaveBeenCalled()
  })

  it("skips sprint lookup when detaching (sprint_id = null)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    workItemsPreflightChain.maybeSingle.mockResolvedValue({
      data: { id: WORK_ITEM_ID, kind: "bug" },
      error: null,
    })
    workItemsUpdateChain.maybeSingle.mockResolvedValue({
      data: { id: WORK_ITEM_ID, sprint_id: null },
      error: null,
    })

    const res = await PATCH(makeReq({ sprint_id: null }), {
      params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }),
    })

    expect(res.status).toBe(200)
    expect(sprintsChain.select).not.toHaveBeenCalled()
    expect(workItemsUpdateChain.update).toHaveBeenCalledWith({
      sprint_id: null,
    })
  })

  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makeReq({ sprint_id: null }), {
      params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }),
    })
    expect(res.status).toBe(401)
  })
})
