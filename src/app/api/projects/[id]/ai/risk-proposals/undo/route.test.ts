/**
 * PROJ-89 — vitest for the risk-proposals undo route.
 *
 * Mocks Supabase auth + `from` + `rpc`. Exercises:
 *   - unauthenticated → 401
 *   - invalid uuid path-param → 400
 *   - empty suggestionIds → 400
 *   - happy path → 200 with reverted id arrays
 *   - RPC undo_window_expired (22023) → 400
 *   - RPC forbidden (42501) → 403
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

function makePost(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/ai/risk-proposals/undo`,
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

describe("POST /api/projects/[id]/ai/risk-proposals/undo", () => {
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

  it("returns 200 + reverted ids on RPC success", async () => {
    setupEditorAccess()
    rpcMock.mockResolvedValue({
      data: [
        {
          reverted_suggestion_ids: [SUG_1],
          reverted_risk_ids: ["risk-1"],
        },
      ],
      error: null,
    })
    const res = await POST(makePost({ suggestionIds: [SUG_1] }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      reverted_suggestion_ids: string[]
      reverted_risk_ids: string[]
    }
    expect(body.reverted_suggestion_ids).toEqual([SUG_1])
    expect(body.reverted_risk_ids).toEqual(["risk-1"])
    expect(rpcMock).toHaveBeenCalledWith("accept_risk_proposals_undo", {
      p_project_id: PROJECT_ID,
      p_suggestion_ids: [SUG_1],
    })
  })

  it("returns 400 on RPC undo_window_expired (22023)", async () => {
    setupEditorAccess()
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "22023", message: "undo_invalid_or_window_expired" },
    })
    const res = await POST(makePost({ suggestionIds: [SUG_1] }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(400)
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
})
