import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-64 — auth + envelope-shape smokes for the dashboard
// summary endpoint. Heavy aggregation is mocked out; covered here:
// 401 unauth, 404 no-tenant, 200 envelope shape (admin + member),
// section-level error degradation.

const mocks = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  resolveActiveTenantIdMock: vi.fn(),
  resolveDashboardSummaryMock: vi.fn(),
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
  }
})

vi.mock("@/app/api/_lib/active-tenant", () => ({
  resolveActiveTenantId: mocks.resolveActiveTenantIdMock,
}))

vi.mock("@/lib/dashboard/summary", () => ({
  resolveDashboardSummary: mocks.resolveDashboardSummaryMock,
}))

import { GET } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "22222222-2222-4222-8222-222222222222"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
  mocks.resolveActiveTenantIdMock.mockResolvedValue(TENANT_ID)
  mocks.fromMock.mockImplementation((table: string) => {
    if (table === "tenant_memberships") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({
          data: { role: "member" },
          error: null,
        })),
      }
    }
    throw new Error(`unexpected from(${table})`)
  })
  mocks.resolveDashboardSummaryMock.mockResolvedValue({
    user_context: {
      user_id: USER_ID,
      tenant_id: TENANT_ID,
      is_tenant_admin: false,
    },
    generated_at: "2026-05-10T00:00:00.000Z",
    kpis: {
      open_assigned: 3,
      overdue: 1,
      pending_approvals: 0,
      at_risk_projects: 0,
    },
    my_work: {
      state: "ready",
      data: { items: [], total: 3, capped: false },
    },
    approvals: { state: "ready", data: { items: [], total: 0 } },
    project_health: {
      state: "ready",
      data: { items: [], total_accessible_projects: 2 },
    },
    alerts: { state: "ready", data: { items: [] } },
    reports: { state: "ready", data: { items: [] } },
    capabilities: {
      can_create_project: false,
      can_create_work_item: true,
      can_open_approvals: true,
      can_open_reports: true,
    },
  })
})

describe("GET /api/dashboard/summary", () => {
  it("returns 401 when the user is not signed in", async () => {
    mocks.getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("unauthorized")
  })

  it("returns 404 when the user has no active tenant", async () => {
    mocks.resolveActiveTenantIdMock.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("no_active_tenant")
  })

  it("returns the full summary envelope shape on the happy path", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { summary: Record<string, unknown> }
    expect(body.summary).toBeDefined()
    expect(body.summary.user_context).toEqual({
      user_id: USER_ID,
      tenant_id: TENANT_ID,
      is_tenant_admin: false,
    })
    // Section envelopes present
    for (const key of [
      "my_work",
      "approvals",
      "project_health",
      "alerts",
      "reports",
    ]) {
      const section = body.summary[key] as { state: string }
      expect(section.state).toBe("ready")
    }
    // KPIs present
    const kpis = body.summary.kpis as {
      open_assigned: number
      overdue: number
    }
    expect(kpis.open_assigned).toBe(3)
    expect(kpis.overdue).toBe(1)
  })

  it("flags is_tenant_admin=true for tenant admin members", async () => {
    mocks.fromMock.mockImplementation((table: string) => {
      if (table === "tenant_memberships") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({
            data: { role: "admin" },
            error: null,
          })),
        }
      }
      throw new Error(`unexpected from(${table})`)
    })
    // Aggregator is called with isTenantAdmin=true; the route
    // forwards that flag verbatim into user_context, so we verify
    // the call argument here.
    mocks.resolveDashboardSummaryMock.mockImplementationOnce(async (args) => ({
      user_context: {
        user_id: args.userId,
        tenant_id: args.tenantId,
        is_tenant_admin: args.isTenantAdmin,
      },
      generated_at: "2026-05-10T00:00:00.000Z",
      kpis: {
        open_assigned: 0,
        overdue: 0,
        pending_approvals: 0,
        at_risk_projects: 0,
      },
      my_work: { state: "ready", data: { items: [], total: 0, capped: false } },
      approvals: { state: "ready", data: { items: [], total: 0 } },
      project_health: {
        state: "ready",
        data: { items: [], total_accessible_projects: 0 },
      },
      alerts: { state: "ready", data: { items: [] } },
      reports: { state: "ready", data: { items: [] } },
      capabilities: {
        can_create_project: true,
        can_create_work_item: true,
        can_open_approvals: true,
        can_open_reports: true,
      },
    }))

    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      summary: { user_context: { is_tenant_admin: boolean } }
    }
    expect(body.summary.user_context.is_tenant_admin).toBe(true)
    expect(mocks.resolveDashboardSummaryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        tenantId: TENANT_ID,
        isTenantAdmin: true,
      }),
    )
  })

  it("forwards section-level error envelopes without failing the whole request", async () => {
    mocks.resolveDashboardSummaryMock.mockResolvedValueOnce({
      user_context: {
        user_id: USER_ID,
        tenant_id: TENANT_ID,
        is_tenant_admin: false,
      },
      generated_at: "2026-05-10T00:00:00.000Z",
      kpis: {
        open_assigned: 0,
        overdue: 0,
        pending_approvals: 0,
        at_risk_projects: 0,
      },
      my_work: {
        state: "error",
        data: null,
        error: "my_work: db down",
      },
      approvals: { state: "ready", data: { items: [], total: 0 } },
      project_health: {
        state: "ready",
        data: { items: [], total_accessible_projects: 0 },
      },
      alerts: { state: "ready", data: { items: [] } },
      reports: { state: "ready", data: { items: [] } },
      capabilities: {
        can_create_project: false,
        can_create_work_item: true,
        can_open_approvals: true,
        can_open_reports: true,
      },
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      summary: {
        my_work: { state: string; error?: string }
        approvals: { state: string }
      }
    }
    expect(body.summary.my_work.state).toBe("error")
    expect(body.summary.my_work.error).toContain("my_work")
    expect(body.summary.approvals.state).toBe("ready")
  })
})
