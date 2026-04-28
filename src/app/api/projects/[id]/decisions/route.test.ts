import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-20 — collection endpoint tests for /api/projects/[id]/decisions.

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

// Single combined chain for the `decisions` table — supports list (GET),
// predecessor lookup (POST with supersedes_decision_id), and insert (POST).
const decisionsChain: {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  then: (resolve: (v: unknown) => void) => void
  __listResult: { data: unknown[] | null; error: { message: string } | null }
} = {
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  insert: vi.fn(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
  __listResult: { data: [], error: null },
  then: (resolve) => resolve(decisionsChain.__listResult),
}

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "project_memberships") return projectMembershipChain
  if (table === "decisions") return decisionsChain
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { GET, POST } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const PRED_ID = "55555555-5555-4555-8555-555555555555"

function makePost(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/decisions`,
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
  decisionsChain.select.mockReturnValue(decisionsChain)
  decisionsChain.eq.mockReturnValue(decisionsChain)
  decisionsChain.order.mockReturnValue(decisionsChain)
  decisionsChain.limit.mockReturnValue(decisionsChain)
  decisionsChain.insert.mockReturnValue(decisionsChain)
  decisionsChain.__listResult = { data: [], error: null }

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

describe("POST /api/projects/[id]/decisions", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(
      makePost({ title: "Pick vendor X", decision_text: "Vendor X chosen" }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(401)
  })

  it("returns 400 on missing decision_text", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(makePost({ title: "Pick" }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(400)
  })

  it("creates a fresh decision (201)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    decisionsChain.single.mockResolvedValue({
      data: {
        id: "d1",
        title: "Pick vendor X",
        decision_text: "Vendor X chosen",
        is_revised: false,
        supersedes_decision_id: null,
      },
      error: null,
    })
    const res = await POST(
      makePost({
        title: "Pick vendor X",
        decision_text: "Vendor X chosen because of price.",
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(201)
  })

  it("rejects revision when predecessor is already revised (409)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    decisionsChain.maybeSingle.mockResolvedValue({
      data: {
        id: PRED_ID,
        project_id: PROJECT_ID,
        is_revised: true,
      },
      error: null,
    })
    const res = await POST(
      makePost({
        title: "Revised pick",
        decision_text: "Vendor Y chosen instead.",
        supersedes_decision_id: PRED_ID,
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(409)
  })

  it("rejects revision when predecessor is in another project (404)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    decisionsChain.maybeSingle.mockResolvedValue({
      data: {
        id: PRED_ID,
        project_id: "99999999-9999-4999-8999-999999999999",
        is_revised: false,
      },
      error: null,
    })
    const res = await POST(
      makePost({
        title: "Revised pick",
        decision_text: "Vendor Y chosen instead.",
        supersedes_decision_id: PRED_ID,
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(404)
  })
})

describe("GET /api/projects/[id]/decisions", () => {
  it("filters out revised by default", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    decisionsChain.__listResult = { data: [], error: null }
    const res = await GET(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/decisions`),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(200)
    expect(decisionsChain.eq).toHaveBeenCalledWith("is_revised", false)
  })

  it("includes revised when requested", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    decisionsChain.__listResult = { data: [], error: null }
    const res = await GET(
      new Request(
        `http://localhost/api/projects/${PROJECT_ID}/decisions?include_revised=true`
      ),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(200)
    const calls = decisionsChain.eq.mock.calls.map((c) => c[0])
    expect(calls).not.toContain("is_revised")
  })
})
