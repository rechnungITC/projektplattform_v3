import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-10 — restore endpoint tests, with focus on M1: warnings array when
// audit_restore_entity flags Class-3 redaction-overwrite cases.

const getUserMock = vi.fn()
const rpcMock = vi.fn()

const stakeholderLookupChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
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
  if (table === "stakeholders") return stakeholderLookupChain
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

// PROJ-Security-α — `audit_restore_entity` is now invoked via the
// service-role admin client. Mock the admin factory to return the
// same rpc mock.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: rpcMock,
  })),
}))

import { POST } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const ENTITY_ID = "33333333-3333-4333-8333-333333333333"
const USER_ID = "44444444-4444-4444-8444-444444444444"
const TARGET_AT = "2026-04-28T01:00:00.000Z"

function makeRequest(body: unknown): Request {
  return new Request(
    `http://localhost/api/audit/stakeholders/${ENTITY_ID}/restore`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }
  )
}

function makeContext() {
  return {
    params: Promise.resolve({
      entity_type: "stakeholders",
      entity_id: ENTITY_ID,
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  stakeholderLookupChain.select.mockReturnValue(stakeholderLookupChain)
  stakeholderLookupChain.eq.mockReturnValue(stakeholderLookupChain)
  projectChain.select.mockReturnValue(projectChain)
  projectChain.eq.mockReturnValue(projectChain)
  tenantMembershipChain.select.mockReturnValue(tenantMembershipChain)
  tenantMembershipChain.eq.mockReturnValue(tenantMembershipChain)
  projectMembershipChain.select.mockReturnValue(projectMembershipChain)
  projectMembershipChain.eq.mockReturnValue(projectMembershipChain)

  stakeholderLookupChain.maybeSingle.mockResolvedValue({
    data: { project_id: PROJECT_ID },
    error: null,
  })
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

describe("POST /api/audit/[entity_type]/[entity_id]/restore", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(
      makeRequest({ target_changed_at: TARGET_AT }),
      makeContext()
    )
    expect(res.status).toBe(401)
  })

  it("happy path: surfaces warnings array from RPC (M1 fix)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rpcMock.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          success: true,
          message: "ok",
          fields_restored: 2,
          warnings: [{ field: "name", reason: "class3_redaction_overwrite" }],
        },
        error: null,
      }),
    })

    const res = await POST(
      makeRequest({ target_changed_at: TARGET_AT }),
      makeContext()
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      fields_restored: number
      warnings: Array<{ field: string; reason: string }>
    }
    expect(body.ok).toBe(true)
    expect(body.fields_restored).toBe(2)
    expect(body.warnings).toEqual([
      { field: "name", reason: "class3_redaction_overwrite" },
    ])
    expect(rpcMock).toHaveBeenCalledWith("audit_restore_entity", {
      p_entity_type: "stakeholders",
      p_entity_id: ENTITY_ID,
      p_target_changed_at: TARGET_AT,
    })
  })

  it("returns warnings:[] when RPC returns null/missing warnings", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    rpcMock.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          success: true,
          message: "ok",
          fields_restored: 1,
          warnings: null,
        },
        error: null,
      }),
    })

    const res = await POST(
      makeRequest({ target_changed_at: TARGET_AT }),
      makeContext()
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { warnings: unknown[] }
    expect(body.warnings).toEqual([])
  })
})
