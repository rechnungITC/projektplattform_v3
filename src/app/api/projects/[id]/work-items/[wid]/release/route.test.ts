import { beforeEach, describe, expect, it, vi } from "vitest"

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
const releasesChain = {
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
  if (table === "releases") return releasesChain
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
const RELEASE_ID = "44444444-4444-4444-8444-444444444444"
const USER_ID = "55555555-5555-4555-8555-555555555555"
const TENANT_ID = "66666666-6666-4666-8666-666666666666"

function makeReq(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/work-items/${WORK_ITEM_ID}/release`,
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
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
  projectsChain.maybeSingle.mockResolvedValue({
    data: { id: PROJECT_ID, tenant_id: TENANT_ID },
    error: null,
  })
  tenantMembershipChain.maybeSingle.mockResolvedValue({
    data: { role: "admin" },
    error: null,
  })
  projectMembershipChain.maybeSingle.mockResolvedValue({
    data: { role: "lead" },
    error: null,
  })
  releasesChain.maybeSingle.mockResolvedValue({
    data: { id: RELEASE_ID, project_id: PROJECT_ID, status: "active" },
    error: null,
  })
  workItemsPreflightChain.maybeSingle.mockResolvedValue({
    data: { id: WORK_ITEM_ID, kind: "story", is_deleted: false },
    error: null,
  })
  workItemsUpdateChain.maybeSingle.mockResolvedValue({
    data: { id: WORK_ITEM_ID, release_id: RELEASE_ID },
    error: null,
  })
})

describe("PATCH /api/projects/[id]/work-items/[wid]/release", () => {
  it("assigns a story to an active release", async () => {
    const res = await PATCH(makeReq({ release_id: RELEASE_ID }), {
      params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }),
    })

    expect(res.status).toBe(200)
    expect(workItemsUpdateChain.update).toHaveBeenCalledWith({
      release_id: RELEASE_ID,
    })
  })

  it("rejects an archived release", async () => {
    releasesChain.maybeSingle.mockResolvedValue({
      data: { id: RELEASE_ID, project_id: PROJECT_ID, status: "archived" },
      error: null,
    })

    const res = await PATCH(makeReq({ release_id: RELEASE_ID }), {
      params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }),
    })

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("release_archived")
    expect(workItemsUpdateChain.update).not.toHaveBeenCalled()
  })

  it("rejects a release from another project", async () => {
    releasesChain.maybeSingle.mockResolvedValue({
      data: { id: RELEASE_ID, project_id: OTHER_PROJECT_ID, status: "active" },
      error: null,
    })

    const res = await PATCH(makeReq({ release_id: RELEASE_ID }), {
      params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }),
    })

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("invalid_release")
    expect(workItemsUpdateChain.update).not.toHaveBeenCalled()
  })

  it("rejects non-release-scope kinds", async () => {
    workItemsPreflightChain.maybeSingle.mockResolvedValue({
      data: { id: WORK_ITEM_ID, kind: "epic", is_deleted: false },
      error: null,
    })

    const res = await PATCH(makeReq({ release_id: RELEASE_ID }), {
      params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }),
    })

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("invalid_kind")
    expect(workItemsUpdateChain.update).not.toHaveBeenCalled()
  })

  it("detaches without looking up a release", async () => {
    workItemsUpdateChain.maybeSingle.mockResolvedValue({
      data: { id: WORK_ITEM_ID, release_id: null },
      error: null,
    })

    const res = await PATCH(makeReq({ release_id: null }), {
      params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }),
    })

    expect(res.status).toBe(200)
    expect(releasesChain.select).not.toHaveBeenCalled()
    expect(workItemsUpdateChain.update).toHaveBeenCalledWith({
      release_id: null,
    })
  })

  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makeReq({ release_id: null }), {
      params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }),
    })
    expect(res.status).toBe(401)
  })
})
