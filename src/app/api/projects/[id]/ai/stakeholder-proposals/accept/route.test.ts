/**
 * PROJ-88 — vitest for the stakeholder-proposals bulk-accept route.
 *
 * Mocks Supabase auth + `from` + `rpc`. Exercises:
 *   - unauthenticated → 401
 *   - invalid uuid path-param → 400
 *   - empty / oversized / non-uuid suggestionIds → 400 validation_error
 *   - happy path → 200 with id arrays incl. created_resource_ids +
 *     linked_stakeholder_ids
 *   - RPC linked_user_not_tenant_member (23514) → 400
 *   - RPC forbidden (42501) → 403
 *   - RPC project_not_found (P0002) → 404
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()
const rpcMock = vi.fn()

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

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "project_memberships") return projectMembershipChain
  if (table === "tenant_settings") {
    const chain: { select: () => unknown; eq: () => unknown; maybeSingle: () => Promise<{ data: null; error: null }> } = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
    }
    return chain
  }
  return projectChain
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))

import { POST } from "./route"

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "22222222-2222-4222-8222-222222222222"
const TENANT_ID = "33333333-3333-4333-8333-333333333333"
const SUG_1 = "44444444-4444-4444-8444-444444444444"
const SUG_2 = "55555555-5555-4555-8555-555555555555"

function makePost(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/ai/stakeholder-proposals/accept`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "content-length": "1" },
      body: JSON.stringify(body),
    },
  )
}

function setupEditorAccess() {
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
  projectChain.maybeSingle.mockResolvedValue({
    data: { id: PROJECT_ID, tenant_id: TENANT_ID, project_method: "scrum" },
    error: null,
  })
  tenantMembershipChain.maybeSingle.mockResolvedValue({
    data: { role: "member" },
    error: null,
  })
  projectMembershipChain.maybeSingle.mockResolvedValue({
    data: { role: "editor" },
    error: null,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/projects/[id]/ai/stakeholder-proposals/accept", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePost({ suggestionIds: [SUG_1] }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid uuid path-param", async () => {
    setupEditorAccess()
    const res = await POST(makePost({ suggestionIds: [SUG_1] }), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 on empty suggestionIds array", async () => {
    setupEditorAccess()
    const res = await POST(makePost({ suggestionIds: [] }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 on suggestionIds containing non-uuid", async () => {
    setupEditorAccess()
    const res = await POST(makePost({ suggestionIds: ["not-a-uuid"] }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 on > 30 suggestionIds", async () => {
    setupEditorAccess()
    const tooMany = Array.from({ length: 31 }, () => SUG_1)
    const res = await POST(makePost({ suggestionIds: tooMany }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 200 + id arrays on RPC success", async () => {
    setupEditorAccess()
    const acceptedAt = "2026-06-10T12:00:00Z"
    rpcMock.mockResolvedValue({
      data: [
        {
          accepted_suggestion_ids: [SUG_1, SUG_2],
          created_stakeholder_ids: ["sh-1"],
          created_resource_ids: ["res-1"],
          linked_stakeholder_ids: ["sh-existing"],
          accepted_at: acceptedAt,
        },
      ],
      error: null,
    })
    const res = await POST(makePost({ suggestionIds: [SUG_1, SUG_2] }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      accepted_suggestion_ids: string[]
      created_stakeholder_ids: string[]
      created_resource_ids: string[]
      linked_stakeholder_ids: string[]
      accepted_at: string
    }
    expect(body.accepted_suggestion_ids).toEqual([SUG_1, SUG_2])
    expect(body.created_stakeholder_ids).toEqual(["sh-1"])
    expect(body.created_resource_ids).toEqual(["res-1"])
    expect(body.linked_stakeholder_ids).toEqual(["sh-existing"])
    expect(body.accepted_at).toBe(acceptedAt)
    expect(rpcMock).toHaveBeenCalledWith("accept_stakeholder_proposals_bulk", {
      p_project_id: PROJECT_ID,
      p_suggestion_ids: [SUG_1, SUG_2],
    })
  })

  it("returns 400 on RPC linked_user_not_tenant_member (23514)", async () => {
    setupEditorAccess()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "linked_user_not_tenant_member" },
    })
    const res = await POST(makePost({ suggestionIds: [SUG_1] }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("validation_error")
  })

  it("returns 403 on RPC forbidden (42501)", async () => {
    setupEditorAccess()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "forbidden" },
    })
    const res = await POST(makePost({ suggestionIds: [SUG_1] }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(403)
  })

  it("returns 404 on RPC project_not_found (P0002)", async () => {
    setupEditorAccess()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "project_not_found" },
    })
    const res = await POST(makePost({ suggestionIds: [SUG_1] }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(404)
  })
})
