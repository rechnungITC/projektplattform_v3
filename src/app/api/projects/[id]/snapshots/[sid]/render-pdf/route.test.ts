import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  adminFromMock: vi.fn(),
  requireProjectAccessMock: vi.fn(),
  requireModuleActiveMock: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUserMock },
    from: mocks.fromMock,
  })),
}))

vi.mock("../../../../../_lib/route-helpers", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../../_lib/route-helpers")
  >("../../../../../_lib/route-helpers")
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

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mocks.adminFromMock,
  })),
}))

vi.mock("@/lib/reports/puppeteer-render", () => ({
  renderSnapshotPdf: vi.fn(),
}))

import { renderSnapshotPdf } from "@/lib/reports/puppeteer-render"

import { POST } from "./route"

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const TENANT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const SNAPSHOT_ID = "44444444-4444-4444-8444-444444444444"

const ctx = { params: Promise.resolve({ id: PROJECT_ID, sid: SNAPSHOT_ID }) }

function makeRequest(): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/snapshots/${SNAPSHOT_ID}/render-pdf`,
    { method: "POST" },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
  mocks.requireProjectAccessMock.mockResolvedValue({
    project: { id: PROJECT_ID, tenant_id: TENANT_ID },
  })
  mocks.requireModuleActiveMock.mockResolvedValue(null)
  mocks.fromMock.mockReset()
  mocks.adminFromMock.mockReset()
})

describe("POST /api/projects/[id]/snapshots/[sid]/render-pdf", () => {
  it("renders a failed snapshot again and marks the PDF available", async () => {
    const adminUpdate = vi.fn().mockReturnThis()
    const adminEq = vi.fn(async () => ({ error: null }))

    vi.mocked(renderSnapshotPdf).mockResolvedValue({
      storageKey: `${TENANT_ID}/${PROJECT_ID}/${SNAPSHOT_ID}.pdf`,
      byteSize: 2048,
      durationMs: 1200,
    })
    mocks.adminFromMock.mockImplementation((table: string) => {
      if (table !== "report_snapshots") {
        throw new Error(`unexpected admin from(${table})`)
      }
      return { update: adminUpdate, eq: adminEq }
    })
    mocks.fromMock.mockImplementation((table: string) => {
      if (table === "report_snapshots") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({
            data: {
              id: SNAPSHOT_ID,
              tenant_id: TENANT_ID,
              project_id: PROJECT_ID,
              pdf_status: "failed",
            },
            error: null,
          })),
        }
      }
      throw new Error(`unexpected from(${table})`)
    })

    const res = await POST(makeRequest(), ctx)

    expect(res.status).toBe(204)
    expect(renderSnapshotPdf).toHaveBeenCalledWith({
      origin: "http://localhost",
      snapshotId: SNAPSHOT_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      cookieHeader: null,
    })
    expect(adminUpdate).toHaveBeenCalledWith({
      pdf_storage_key: `${TENANT_ID}/${PROJECT_ID}/${SNAPSHOT_ID}.pdf`,
      pdf_status: "available",
    })
    expect(adminEq).toHaveBeenCalledWith("id", SNAPSHOT_ID)
  })
})
