import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-56 — readiness route smoke. Heavy aggregation is mocked.

const mocks = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  requireProjectAccessMock: vi.fn(),
  resolveProjectReadinessMock: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUserMock },
    from: mocks.fromMock,
  })),
}))

vi.mock("@/app/api/_lib/route-helpers", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/api/_lib/route-helpers")
  >("@/app/api/_lib/route-helpers")
  return {
    ...actual,
    getAuthenticatedUserId: vi.fn(async () => {
      const { data } = await mocks.getUserMock()
      const userId = data?.user?.id ?? null
      return {
        userId,
        supabase: { auth: { getUser: mocks.getUserMock }, from: mocks.fromMock },
      }
    }),
    requireProjectAccess: mocks.requireProjectAccessMock,
  }
})

vi.mock("@/lib/project-readiness/aggregate", () => ({
  resolveProjectReadiness: mocks.resolveProjectReadinessMock,
}))

import { GET } from "./route"

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const TENANT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"

function makeRequest(): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/readiness`,
    { method: "GET" },
  )
}
const ctx = { params: Promise.resolve({ id: PROJECT_ID }) }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
  mocks.requireProjectAccessMock.mockResolvedValue({
    project: { id: PROJECT_ID, tenant_id: TENANT_ID },
  })
  mocks.resolveProjectReadinessMock.mockResolvedValue({
    project_id: PROJECT_ID,
    generated_at: "2026-05-11T00:00:00Z",
    state: "ready_with_gaps",
    items: [
      {
        key: "team_members",
        status: "open",
        severity: "warning",
        label: "Projektmitglieder erfasst",
        explanation: "Mindestens 1 Mitglied empfohlen.",
        target_url: `/projects/${PROJECT_ID}/mitglieder`,
      },
    ],
    next_actions: [],
    counts: {
      open_blockers: 0,
      open_warnings: 1,
      satisfied: 5,
      not_applicable: 0,
    },
  })
})

describe("GET /api/projects/[id]/readiness", () => {
  it("returns 401 when not signed in", async () => {
    mocks.getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest(), ctx)
    expect(res.status).toBe(401)
  })

  it("returns the readiness snapshot for an authenticated member", async () => {
    const res = await GET(makeRequest(), ctx)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      readiness: { state: string; counts: { open_warnings: number } }
    }
    expect(body.readiness.state).toBe("ready_with_gaps")
    expect(body.readiness.counts.open_warnings).toBe(1)
  })

  it("forwards the projectAccess error when access is denied", async () => {
    mocks.requireProjectAccessMock.mockResolvedValue({
      error: new Response(
        JSON.stringify({ error: { code: "not_found", message: "Project not found." } }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
    })
    const res = await GET(makeRequest(), ctx)
    expect(res.status).toBe(404)
  })
})
