import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-20 — convert-to-task endpoint tests.

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
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))

import { POST } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const ITEM_ID = "44444444-4444-4444-8444-444444444444"
const USER_ID = "33333333-3333-4333-8333-333333333333"

function makePost(): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/open-items/${ITEM_ID}/convert-to-task`,
    { method: "POST" }
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

describe("POST /api/projects/[id]/open-items/[oid]/convert-to-task", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePost(), {
      params: Promise.resolve({ id: PROJECT_ID, oid: ITEM_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 200 + work_item_id on success", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rpcMock.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { success: true, message: "ok", work_item_id: "wi-new" },
        error: null,
      }),
    })
    const res = await POST(makePost(), {
      params: Promise.resolve({ id: PROJECT_ID, oid: ITEM_ID }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { work_item_id: string }
    expect(body.work_item_id).toBe("wi-new")
  })

  it("returns 409 when already converted", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rpcMock.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          success: false,
          message: "already_converted",
          work_item_id: null,
        },
        error: null,
      }),
    })
    const res = await POST(makePost(), {
      params: Promise.resolve({ id: PROJECT_ID, oid: ITEM_ID }),
    })
    expect(res.status).toBe(409)
  })

  it("returns 404 when open item missing", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rpcMock.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          success: false,
          message: "open_item_not_found",
          work_item_id: null,
        },
        error: null,
      }),
    })
    const res = await POST(makePost(), {
      params: Promise.resolve({ id: PROJECT_ID, oid: ITEM_ID }),
    })
    expect(res.status).toBe(404)
  })
})
