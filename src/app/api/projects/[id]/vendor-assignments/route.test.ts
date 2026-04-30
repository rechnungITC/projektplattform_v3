import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-15 — project-vendor-assignment endpoint tests.

const getUserMock = vi.fn()

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

const insertChain = {
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "project_memberships") return projectMembershipChain
  if (table === "vendor_project_assignments") return insertChain
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
  })),
}))

import { POST } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const VENDOR_ID = "44444444-4444-4444-8444-444444444444"

function makePost(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/vendor-assignments`,
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
  insertChain.insert.mockReturnValue(insertChain)
  insertChain.select.mockReturnValue(insertChain)

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

describe("POST /api/projects/[id]/vendor-assignments", () => {
  it("returns 400 on bad role", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(
      makePost({ vendor_id: VENDOR_ID, role: "kapellmeister" }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 on reversed dates", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(
      makePost({
        vendor_id: VENDOR_ID,
        role: "lieferant",
        valid_from: "2026-12-31",
        valid_until: "2026-01-01",
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it("creates assignment on valid input (201)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: {
        id: "a1",
        tenant_id: TENANT_ID,
        project_id: PROJECT_ID,
        vendor_id: VENDOR_ID,
        role: "lieferant",
        scope_note: null,
        valid_from: null,
        valid_until: null,
        created_by: USER_ID,
        created_at: "2026-04-30T00:00:00Z",
        updated_at: "2026-04-30T00:00:00Z",
        vendors: { name: "Acme GmbH" },
      },
      error: null,
    })
    const res = await POST(
      makePost({ vendor_id: VENDOR_ID, role: "lieferant" }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      assignment: { id: string; vendor_name: string }
    }
    expect(body.assignment.id).toBe("a1")
    expect(body.assignment.vendor_name).toBe("Acme GmbH")
  })

  it("returns 409 on duplicate (project, vendor, role)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate" },
    })
    const res = await POST(
      makePost({ vendor_id: VENDOR_ID, role: "lieferant" }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(409)
  })

  it("returns 422 when vendor_id doesn't exist (FK violation)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    insertChain.single.mockResolvedValue({
      data: null,
      error: { code: "23503", message: "fk" },
    })
    const res = await POST(
      makePost({ vendor_id: VENDOR_ID, role: "lieferant" }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(422)
  })
})
