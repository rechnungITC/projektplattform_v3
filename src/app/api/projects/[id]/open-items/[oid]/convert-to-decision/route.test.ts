import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-20 — convert-to-decision endpoint tests.

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
    const chain: { select: unknown; eq: unknown; maybeSingle: unknown } = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
    }
    return chain
  }
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))

// PROJ-Security — RPC routed through admin-client.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: rpcMock,
  })),
}))

import { POST } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const ITEM_ID = "44444444-4444-4444-8444-444444444444"
const USER_ID = "33333333-3333-4333-8333-333333333333"

function makePost(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/open-items/${ITEM_ID}/convert-to-decision`,
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
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  projectMembershipChain.select.mockReturnValue(projectMembershipChain)
  projectMembershipChain.eq.mockReturnValue(projectMembershipChain)

  projectChain.maybeSingle.mockResolvedValue({
    data: { id: PROJECT_ID, tenant_id: TENANT_ID },
    error: null,
  })
  tenantMembershipChain.maybeSingle.mockResolvedValue({
    data: { role: "admin" },
    error: null,
  })
  projectMembershipChain.maybeSingle.mockResolvedValue({
    data: null,
    error: null,
  })
})

describe("POST /api/projects/[id]/open-items/[oid]/convert-to-decision", () => {
  it("returns 400 on empty decision_text", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(makePost({ decision_text: "" }), {
      params: Promise.resolve({ id: PROJECT_ID, oid: ITEM_ID }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 200 + decision_id on success", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rpcMock.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { success: true, message: "ok", decision_id: "d-new" },
        error: null,
      }),
    })
    const res = await POST(
      makePost({
        decision_text: "We chose Vendor X based on price/feature analysis.",
      }),
      { params: Promise.resolve({ id: PROJECT_ID, oid: ITEM_ID }) }
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { decision_id: string }
    expect(body.decision_id).toBe("d-new")
  })

  it("returns 409 when already converted", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rpcMock.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          success: false,
          message: "already_converted",
          decision_id: null,
        },
        error: null,
      }),
    })
    const res = await POST(makePost({ decision_text: "Vendor X." }), {
      params: Promise.resolve({ id: PROJECT_ID, oid: ITEM_ID }),
    })
    expect(res.status).toBe(409)
  })
})
