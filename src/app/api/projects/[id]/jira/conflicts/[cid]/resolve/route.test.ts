/**
 * PROJ-50 — vitest for the conflict-resolve route.
 *
 *   - 401 unauthenticated
 *   - 403 viewer (edit denied)
 *   - 404 conflict not found
 *   - 409 already resolved
 *   - 200 manual (records decision, no work-item write)
 *   - 200 jira_wins on title → applies value + resolves
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()

const projectChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn() }
const tenantMembershipChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn() }
const projectMembershipChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn() }
const conflictChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn() }

const workItemUpdate = vi.fn()
const conflictUpdate = vi.fn()

/** An object whose .eq() chains arbitrarily and awaits to `result`. */
function resolvingEq(result: { error: unknown }) {
  const obj: Record<string, unknown> = {}
  obj.eq = vi.fn(() => obj)
  obj.is = vi.fn(() => obj)
  obj.then = (res: (v: { error: unknown }) => void) => res(result)
  return obj
}

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "project_memberships") return projectMembershipChain
  if (table === "jira_sync_conflicts") {
    return { ...conflictChain, update: conflictUpdate }
  }
  if (table === "work_items") return { update: workItemUpdate }
  return projectChain
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: getUserMock }, from: fromMock })),
}))

import { POST } from "./route"

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "22222222-2222-4222-8222-222222222222"
const TENANT_ID = "33333333-3333-4333-8333-333333333333"
const CID = "44444444-4444-4444-8444-444444444444"
const WID = "55555555-5555-4555-8555-555555555555"

function makePost(body: unknown, cid = CID): Request {
  return new Request(`http://localhost/api/projects/${PROJECT_ID}/jira/conflicts/${cid}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}
const params = (cid = CID) => ({ params: Promise.resolve({ id: PROJECT_ID, cid }) })

function setupEditor() {
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
  projectChain.maybeSingle.mockResolvedValue({ data: { id: PROJECT_ID, tenant_id: TENANT_ID }, error: null })
  tenantMembershipChain.maybeSingle.mockResolvedValue({ data: { role: "member" }, error: null })
  projectMembershipChain.maybeSingle.mockResolvedValue({ data: { role: "editor" }, error: null })
}

beforeEach(() => {
  vi.clearAllMocks()
  workItemUpdate.mockReturnValue(resolvingEq({ error: null }))
  conflictUpdate.mockReturnValue(resolvingEq({ error: null }))
})

describe("POST .../jira/conflicts/[cid]/resolve", () => {
  it("401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePost({ resolution: "manual" }), params())
    expect(res.status).toBe(401)
  })

  it("403 for a viewer (edit denied)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    projectChain.maybeSingle.mockResolvedValue({ data: { id: PROJECT_ID, tenant_id: TENANT_ID }, error: null })
    tenantMembershipChain.maybeSingle.mockResolvedValue({ data: { role: "member" }, error: null })
    projectMembershipChain.maybeSingle.mockResolvedValue({ data: { role: "viewer" }, error: null })
    const res = await POST(makePost({ resolution: "manual" }), params())
    expect(res.status).toBe(403)
  })

  it("400 on invalid resolution value", async () => {
    setupEditor()
    const res = await POST(makePost({ resolution: "bogus" }), params())
    expect(res.status).toBe(400)
  })

  it("404 when conflict not found", async () => {
    setupEditor()
    conflictChain.maybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await POST(makePost({ resolution: "manual" }), params())
    expect(res.status).toBe(404)
  })

  it("409 when already resolved", async () => {
    setupEditor()
    conflictChain.maybeSingle.mockResolvedValue({
      data: { id: CID, project_id: PROJECT_ID, work_item_id: WID, field: "title", jira_value: "x", resolution: "v3_wins" },
      error: null,
    })
    const res = await POST(makePost({ resolution: "manual" }), params())
    expect(res.status).toBe(409)
  })

  it("200 manual — records decision, no work-item write", async () => {
    setupEditor()
    conflictChain.maybeSingle.mockResolvedValue({
      data: { id: CID, project_id: PROJECT_ID, work_item_id: WID, field: "title", jira_value: "Jira title", resolution: "pending" },
      error: null,
    })
    const res = await POST(makePost({ resolution: "manual" }), params())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { applied: boolean }
    expect(body.applied).toBe(false)
    expect(workItemUpdate).not.toHaveBeenCalled()
    expect(conflictUpdate).toHaveBeenCalledTimes(1)
  })

  it("200 jira_wins on title — applies value + resolves", async () => {
    setupEditor()
    conflictChain.maybeSingle.mockResolvedValue({
      data: { id: CID, project_id: PROJECT_ID, work_item_id: WID, field: "title", jira_value: "Jira title", resolution: "pending" },
      error: null,
    })
    const res = await POST(makePost({ resolution: "jira_wins" }), params())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { applied: boolean }
    expect(body.applied).toBe(true)
    expect(workItemUpdate).toHaveBeenCalledWith({ title: "Jira title" })
    expect(conflictUpdate).toHaveBeenCalledTimes(1)
  })

  it("200 jira_wins on status — records only, no work-item write (α)", async () => {
    setupEditor()
    conflictChain.maybeSingle.mockResolvedValue({
      data: { id: CID, project_id: PROJECT_ID, work_item_id: WID, field: "status", jira_value: "Done", resolution: "pending" },
      error: null,
    })
    const res = await POST(makePost({ resolution: "jira_wins" }), params())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { applied: boolean }
    expect(body.applied).toBe(false)
    expect(workItemUpdate).not.toHaveBeenCalled()
  })
})
