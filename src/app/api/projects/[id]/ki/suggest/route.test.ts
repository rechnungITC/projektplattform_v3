import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-12 — POST /api/projects/[id]/ki/suggest

const getUserMock = vi.fn()
const { invokeRiskGenerationMock, collectRiskAutoContextMock } = vi.hoisted(
  () => ({
    invokeRiskGenerationMock: vi.fn(),
    collectRiskAutoContextMock: vi.fn(),
  })
)

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
  })),
}))
vi.mock("@/lib/ai/router", () => ({
  invokeRiskGeneration: invokeRiskGenerationMock,
}))
vi.mock("@/lib/ai/auto-context", () => ({
  collectRiskAutoContext: collectRiskAutoContextMock,
}))

import { POST } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"

function makePost(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/ki/suggest`,
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

  collectRiskAutoContextMock.mockResolvedValue({
    project: {
      name: "Test",
      project_type: null,
      project_method: null,
      lifecycle_status: "draft",
      planned_start_date: null,
      planned_end_date: null,
    },
    phases: [],
    milestones: [],
    work_items: [],
    existing_risks: [],
  })
  invokeRiskGenerationMock.mockResolvedValue({
    run_id: "run-1",
    classification: 2,
    provider: "stub",
    model_id: "stub-deterministic-v1",
    status: "success",
    suggestion_ids: ["s1", "s2"],
    external_blocked: false,
  })
})

describe("POST /api/projects/[id]/ki/suggest", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePost({ purpose: "risks" }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 200 + provider/run_id/suggestion_ids on success", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(
      makePost({ purpose: "risks", count: 2 }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      run_id: string
      provider: string
      suggestion_ids: string[]
    }
    expect(body.run_id).toBe("run-1")
    expect(body.provider).toBe("stub")
    expect(body.suggestion_ids).toHaveLength(2)
  })

  it("returns 502 when the router reports an error", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    invokeRiskGenerationMock.mockResolvedValueOnce({
      run_id: "run-2",
      classification: 2,
      provider: "stub",
      model_id: null,
      status: "error",
      suggestion_ids: [],
      external_blocked: false,
      error_message: "boom",
    })
    const res = await POST(makePost({ purpose: "risks" }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(502)
  })

  it("rejects bad count via Zod", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await POST(makePost({ purpose: "risks", count: 99 }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(400)
  })
})
