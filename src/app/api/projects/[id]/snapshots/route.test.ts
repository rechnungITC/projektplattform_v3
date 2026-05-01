import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-21 — auth + module-gate smokes for the snapshot routes.
// Covers: 401 unauth, 403 wrong-role on POST, 400 invalid body. Full
// create-with-render path is exercised by /qa live (requires
// Puppeteer + Storage). Routes that mutate are mocked via
// requireProjectAccess + requireModuleActive helpers.

const mocks = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  requireProjectAccessMock: vi.fn(),
  requireModuleActiveMock: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUserMock },
    from: mocks.fromMock,
  })),
}))

vi.mock("../../../_lib/route-helpers", async () => {
  const actual = await vi.importActual<
    typeof import("../../../_lib/route-helpers")
  >("../../../_lib/route-helpers")
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

vi.mock("@/lib/tenant-settings/server", () => ({
  requireModuleActive: mocks.requireModuleActiveMock,
}))

// Stub out the heavy server-only dependencies so we can import the
// route module without actually launching Chromium during the test.
vi.mock("@/lib/reports/aggregate-snapshot-data", () => ({
  aggregateSnapshotData: vi.fn(),
}))
vi.mock("@/lib/reports/puppeteer-render", () => ({
  renderSnapshotPdf: vi.fn(),
}))

import { GET, POST } from "./route"

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const TENANT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"

function makeRequest(method: "GET" | "POST", body?: unknown): Request {
  const init: RequestInit = { method }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { "Content-Type": "application/json" }
  }
  return new Request(`http://localhost/api/projects/${PROJECT_ID}/snapshots`, init)
}

const ctx = { params: Promise.resolve({ id: PROJECT_ID }) }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
  mocks.requireProjectAccessMock.mockResolvedValue({
    project: { id: PROJECT_ID, tenant_id: TENANT_ID },
  })
  mocks.requireModuleActiveMock.mockResolvedValue(null)
  mocks.fromMock.mockReset()
})

describe("GET /api/projects/[id]/snapshots", () => {
  it("returns 401 when not signed in", async () => {
    mocks.getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest("GET"), ctx)
    expect(res.status).toBe(401)
  })

  it("returns the snapshot list with transformed shape", async () => {
    mocks.fromMock.mockImplementation((table: string) => {
      if (table === "report_snapshots") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn(async () => ({
            data: [
              {
                id: "s-1",
                kind: "status_report",
                version: 2,
                generated_at: "2026-05-01T00:00:00Z",
                generated_by: USER_ID,
                content: { ki_summary: { text: "x" }, generated_by_name: "Tester" },
                pdf_status: "available",
                ki_summary_classification: 2,
              },
            ],
            error: null,
          })),
        }
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn(async () => ({
            data: [
              { user_id: USER_ID, display_name: "Tester", email: "t@e.test" },
            ],
            error: null,
          })),
        }
      }
      throw new Error(`unexpected from(${table})`)
    })

    const res = await GET(makeRequest("GET"), ctx)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { snapshots: unknown[] }
    expect(body.snapshots).toHaveLength(1)
    const first = body.snapshots[0] as { has_ki_summary: boolean; pdf_status: string }
    expect(first.has_ki_summary).toBe(true)
    expect(first.pdf_status).toBe("available")
  })

  it("forwards the module-disabled error from the server helper", async () => {
    mocks.requireModuleActiveMock.mockResolvedValue(
      new Response(null, { status: 404 }),
    )
    const res = await GET(makeRequest("GET"), ctx)
    expect(res.status).toBe(404)
  })
})

describe("POST /api/projects/[id]/snapshots", () => {
  it("returns 401 when not signed in", async () => {
    mocks.getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(
      makeRequest("POST", { kind: "status_report" }),
      ctx,
    )
    expect(res.status).toBe(401)
  })

  it("forwards the 403 from requireProjectAccess (non-editor)", async () => {
    mocks.requireProjectAccessMock.mockResolvedValue({
      error: new Response(null, { status: 403 }),
    })
    const res = await POST(
      makeRequest("POST", { kind: "status_report" }),
      ctx,
    )
    expect(res.status).toBe(403)
  })

  it("returns 400 on invalid body (missing kind)", async () => {
    const res = await POST(makeRequest("POST", {}), ctx)
    expect(res.status).toBe(400)
  })

  it("returns 400 on body with unknown kind", async () => {
    const res = await POST(
      makeRequest("POST", { kind: "weekly_brief" }),
      ctx,
    )
    expect(res.status).toBe(400)
  })
})
