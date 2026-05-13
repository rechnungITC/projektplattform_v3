import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()

function chain(methods: string[]) {
  const out: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of methods) out[method] = vi.fn().mockReturnThis()
  return out
}

const projectAccessChain = {
  ...chain(["select", "eq"]),
  maybeSingle: vi.fn(),
}
const tenantMembershipChain = {
  ...chain(["select", "eq"]),
  maybeSingle: vi.fn(),
}
const projectMembershipChain = {
  ...chain(["select", "eq"]),
  maybeSingle: vi.fn(),
}
const projectMethodChain = {
  ...chain(["select", "eq"]),
  maybeSingle: vi.fn(),
}
const milestoneChain = {
  ...chain(["select", "eq"]),
  maybeSingle: vi.fn(),
}
const releaseInsertChain = {
  ...chain(["insert", "select"]),
  single: vi.fn(),
}

let nextProjectChain: "access" | "method" = "access"

const fromMock = vi.fn((table: string) => {
  if (table === "projects") {
    if (nextProjectChain === "access") {
      nextProjectChain = "method"
      return projectAccessChain
    }
    return projectMethodChain
  }
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "project_memberships") return projectMembershipChain
  if (table === "milestones") return milestoneChain
  if (table === "releases") return releaseInsertChain
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { POST } from "./route"

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const TENANT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const MILESTONE_ID = "44444444-4444-4444-8444-444444444444"

function makePost(body: unknown, projectId = PROJECT_ID) {
  return {
    request: new Request(
      `http://localhost/api/projects/${projectId}/releases`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    ),
    context: { params: Promise.resolve({ id: projectId }) },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  nextProjectChain = "access"
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
  projectAccessChain.maybeSingle.mockResolvedValue({
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
  projectMethodChain.maybeSingle.mockResolvedValue({
    data: {
      id: PROJECT_ID,
      tenant_id: TENANT_ID,
      project_method: "scrum",
    },
    error: null,
  })
  milestoneChain.maybeSingle.mockResolvedValue({
    data: { id: MILESTONE_ID, project_id: PROJECT_ID, is_deleted: false },
    error: null,
  })
  releaseInsertChain.single.mockResolvedValue({
    data: { id: "release-1", name: "R1" },
    error: null,
  })
})

describe("POST /api/projects/[id]/releases", () => {
  it("creates a release for a Scrum project", async () => {
    const { request, context } = makePost({
      name: " R1 ",
      description: " Release scope ",
      start_date: "2026-05-01",
      end_date: "2026-05-31",
      target_milestone_id: MILESTONE_ID,
    })

    const res = await POST(request, context)

    expect(res.status).toBe(201)
    expect(releaseInsertChain.insert).toHaveBeenCalledWith({
      name: "R1",
      description: "Release scope",
      start_date: "2026-05-01",
      end_date: "2026-05-31",
      target_milestone_id: MILESTONE_ID,
      tenant_id: TENANT_ID,
      project_id: PROJECT_ID,
      created_by: USER_ID,
    })
  })

  it("rejects releases for plan-driven methods", async () => {
    projectMethodChain.maybeSingle.mockResolvedValue({
      data: {
        id: PROJECT_ID,
        tenant_id: TENANT_ID,
        project_method: "waterfall",
      },
      error: null,
    })

    const { request, context } = makePost({ name: "R1" })
    const res = await POST(request, context)

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("release_not_allowed_in_method")
    expect(body.error.field).toBe("project_method")
    expect(releaseInsertChain.insert).not.toHaveBeenCalled()
  })

  it("rejects a target milestone from another project", async () => {
    milestoneChain.maybeSingle.mockResolvedValue({
      data: {
        id: MILESTONE_ID,
        project_id: "55555555-5555-4555-8555-555555555555",
        is_deleted: false,
      },
      error: null,
    })

    const { request, context } = makePost({
      name: "R1",
      target_milestone_id: MILESTONE_ID,
    })
    const res = await POST(request, context)

    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("invalid_target_milestone")
    expect(releaseInsertChain.insert).not.toHaveBeenCalled()
  })

  it("returns 401 without a session", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const { request, context } = makePost({ name: "R1" })
    const res = await POST(request, context)
    expect(res.status).toBe(401)
  })
})
