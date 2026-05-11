import { beforeEach, describe, expect, it, vi } from "vitest"

import { resolveDashboardSummary } from "./summary"

// PROJ-64 — exercises the aggregator end-to-end against a fully
// mocked Supabase client. Validates:
//  - section envelopes are 'ready' on the happy path
//  - section-level errors degrade independently
//  - KPIs derive from the section results
//  - project access is restricted to project_memberships rows
//  - alerts surface critical risks + overdue milestones with
//    correct severity tone

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "22222222-2222-4222-8222-222222222222"
const PROJECT_ID = "33333333-3333-4333-8333-333333333333"
const FOREIGN_PROJECT_ID = "44444444-4444-4444-8444-444444444444"

interface QueryStub {
  data?: unknown
  error?: { message: string } | null
  count?: number | null
}

function makeChain(stub: QueryStub) {
  // Honour explicit `null` data — `??` would clobber it to `[]`.
  const final = {
    data: "data" in stub ? stub.data : [],
    error: stub.error ?? null,
    count: stub.count ?? null,
  }
  // Build a chainable mock that resolves to `final` no matter how
  // many `.eq/.in/.gte/.order/.limit` calls are issued.
  const chain: Record<string, unknown> = {
    then: (
      onFulfilled: (value: typeof final) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(final).then(onFulfilled, onRejected),
  }
  for (const method of [
    "select",
    "eq",
    "in",
    "is",
    "gte",
    "lte",
    "order",
    "limit",
    "maybeSingle",
  ]) {
    ;(chain as Record<string, unknown>)[method] = vi.fn().mockReturnValue(chain)
  }
  ;(chain as Record<string, unknown>).maybeSingle = vi.fn(async () => final)
  return chain
}

function buildSupabase(byTable: Record<string, QueryStub>) {
  return {
    from: vi.fn((table: string) => {
      const stub = byTable[table]
      if (!stub) {
        throw new Error(`unexpected from(${table})`)
      }
      return makeChain(stub)
    }),
  } as unknown as Parameters<typeof resolveDashboardSummary>[0]["supabase"]
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-05-10T12:00:00.000Z"))
})

describe("resolveDashboardSummary", () => {
  it("returns ready envelopes on the happy path with derived KPIs", async () => {
    const supabase = buildSupabase({
      project_memberships: {
        data: [
          {
            project_id: PROJECT_ID,
            projects: {
              id: PROJECT_ID,
              tenant_id: TENANT_ID,
              name: "Alpha",
              project_type: "software",
              project_method: "scrum",
              lifecycle_status: "active",
              responsible_user_id: USER_ID,
              is_deleted: false,
            },
          },
        ],
      },
      tenant_settings: { data: null },
      work_items: {
        count: 2,
        data: [
          {
            id: "wi-1",
            project_id: PROJECT_ID,
            kind: "task",
            title: "Refactor pipeline",
            status: "in_progress",
            priority: "high",
            planned_start: null,
            planned_end: "2026-04-01",
            milestone_id: null,
            sprint_id: null,
          },
          {
            id: "wi-2",
            project_id: PROJECT_ID,
            kind: "story",
            title: "Plan release",
            status: "todo",
            priority: "medium",
            planned_start: null,
            planned_end: "2026-06-01",
            milestone_id: null,
            sprint_id: null,
          },
        ],
      },
      decision_approvers: { data: [] },
      risks: { data: [] },
      milestones: { data: [] },
      report_snapshots: { data: [] },
    })

    const summary = await resolveDashboardSummary({
      supabase,
      userId: USER_ID,
      tenantId: TENANT_ID,
      isTenantAdmin: false,
    })

    expect(summary.user_context).toEqual({
      user_id: USER_ID,
      tenant_id: TENANT_ID,
      is_tenant_admin: false,
    })
    expect(summary.my_work.state).toBe("ready")
    expect(summary.my_work.data?.items).toHaveLength(2)
    // wi-1 is overdue (Apr 1 < May 10) and gets sorted first.
    expect(summary.my_work.data?.items[0].is_overdue).toBe(true)
    expect(summary.kpis.open_assigned).toBe(2)
    expect(summary.kpis.overdue).toBe(1)
    expect(summary.approvals.state).toBe("ready")
    expect(summary.project_health.state).toBe("ready")
    expect(summary.alerts.state).toBe("ready")
    expect(summary.reports.state).toBe("ready")
  })

  it("surfaces section-level errors without breaking other rollups", async () => {
    const supabase = buildSupabase({
      project_memberships: {
        data: [
          {
            project_id: PROJECT_ID,
            projects: {
              id: PROJECT_ID,
              tenant_id: TENANT_ID,
              name: "Alpha",
              project_type: "software",
              project_method: "scrum",
              lifecycle_status: "active",
              responsible_user_id: USER_ID,
              is_deleted: false,
            },
          },
        ],
      },
      tenant_settings: { data: null },
      // Force my_work to fail
      work_items: { error: { message: "permission denied" } },
      decision_approvers: { data: [] },
      risks: { data: [] },
      milestones: { data: [] },
      report_snapshots: { data: [] },
    })

    const summary = await resolveDashboardSummary({
      supabase,
      userId: USER_ID,
      tenantId: TENANT_ID,
      isTenantAdmin: false,
    })

    expect(summary.my_work.state).toBe("error")
    expect(summary.my_work.error).toContain("permission denied")
    expect(summary.approvals.state).toBe("ready")
    expect(summary.project_health.state).toBe("ready")
  })

  it("returns empty sections when the user has no project memberships", async () => {
    const supabase = buildSupabase({
      project_memberships: { data: [] },
      tenant_settings: { data: null },
      decision_approvers: { data: [] },
      report_snapshots: { data: [] },
    })

    const summary = await resolveDashboardSummary({
      supabase,
      userId: USER_ID,
      tenantId: TENANT_ID,
      isTenantAdmin: true,
    })

    expect(summary.my_work.data?.items).toEqual([])
    expect(summary.project_health.data?.items).toEqual([])
    expect(summary.project_health.data?.total_accessible_projects).toBe(0)
    expect(summary.alerts.data?.items).toEqual([])
    // Tenant admins still get the can_create_project capability.
    expect(summary.capabilities.can_create_project).toBe(true)
  })

  it("excludes projects outside the user's project_memberships", async () => {
    const supabase = buildSupabase({
      // Only the membership for PROJECT_ID is returned. Even if RLS
      // accidentally let the foreign project leak, it's not in the
      // accessible-projects list, so dependent sections should not
      // mention it.
      project_memberships: {
        data: [
          {
            project_id: PROJECT_ID,
            projects: {
              id: PROJECT_ID,
              tenant_id: TENANT_ID,
              name: "Alpha",
              project_type: "software",
              project_method: "scrum",
              lifecycle_status: "active",
              responsible_user_id: USER_ID,
              is_deleted: false,
            },
          },
        ],
      },
      tenant_settings: { data: null },
      // Even if Supabase returned a row referring to FOREIGN_PROJECT_ID,
      // the aggregator must drop it because the project isn't in the
      // accessible map.
      work_items: {
        data: [
          {
            id: "wi-foreign",
            project_id: FOREIGN_PROJECT_ID,
            kind: "task",
            title: "Should not leak",
            status: "todo",
            priority: "low",
            planned_end: null,
          },
        ],
      },
      decision_approvers: { data: [] },
      risks: {
        data: [
          {
            id: "rsk-foreign",
            project_id: FOREIGN_PROJECT_ID,
            title: "leak",
            score: 25,
            status: "open",
          },
        ],
      },
      milestones: { data: [] },
      report_snapshots: { data: [] },
    })

    const summary = await resolveDashboardSummary({
      supabase,
      userId: USER_ID,
      tenantId: TENANT_ID,
      isTenantAdmin: false,
    })

    expect(summary.my_work.data?.items).toEqual([])
    expect(summary.alerts.data?.items).toEqual([])
  })

  it("flags projects with critical open risks as red in project_health", async () => {
    const supabase = buildSupabase({
      project_memberships: {
        data: [
          {
            project_id: PROJECT_ID,
            projects: {
              id: PROJECT_ID,
              tenant_id: TENANT_ID,
              name: "Alpha",
              project_type: "software",
              project_method: "scrum",
              lifecycle_status: "active",
              responsible_user_id: USER_ID,
              is_deleted: false,
            },
          },
        ],
      },
      tenant_settings: { data: null },
      work_items: { data: [] },
      decision_approvers: { data: [] },
      risks: {
        data: [
          {
            id: "rsk-1",
            project_id: PROJECT_ID,
            title: "Vendor lock-in",
            score: 25,
            status: "open",
          },
          {
            id: "rsk-2",
            project_id: PROJECT_ID,
            title: "Data migration",
            score: 20,
            status: "open",
          },
        ],
      },
      milestones: { data: [] },
      report_snapshots: { data: [] },
    })

    const summary = await resolveDashboardSummary({
      supabase,
      userId: USER_ID,
      tenantId: TENANT_ID,
      isTenantAdmin: false,
    })

    expect(summary.project_health.data?.items).toHaveLength(1)
    expect(summary.project_health.data?.items[0].health).toBe("red")
    // Alerts surfaced both critical risks
    expect(summary.alerts.data?.items.length).toBeGreaterThanOrEqual(2)
    expect(summary.alerts.data?.items[0].kind).toBe("critical_risk")
  })

  it("filters Recent Reports to project_memberships scope (L1 regression)", async () => {
    // Regression for the QA L1 finding: `report_snapshots` are
    // tenant-readable via RLS, so a naive `tenant_id = X` filter
    // would surface project names from projects the user is not a
    // member of. The dashboard's stricter project-access stance
    // requires `project_id IN (accessible)`. This test ensures
    // foreign-project snapshots never reach the response — and
    // that when the user has zero memberships, the section is
    // short-circuited to an empty list (no DB call needed).
    const supabase = buildSupabase({
      project_memberships: { data: [] },
      tenant_settings: { data: null },
      decision_approvers: { data: [] },
      // The DB would normally return tenant-readable snapshots from
      // any project. With the L1 fix, the function should NOT call
      // report_snapshots at all when accessible_projects is empty
      // — so even this stub being present should not leak.
      report_snapshots: {
        data: [
          {
            id: "snap-foreign",
            kind: "status_report",
            version: 1,
            generated_at: "2026-05-01T00:00:00Z",
            project_id: FOREIGN_PROJECT_ID,
            projects: { name: "Foreign project" },
          },
        ],
      },
    })

    const summary = await resolveDashboardSummary({
      supabase,
      userId: USER_ID,
      tenantId: TENANT_ID,
      isTenantAdmin: true,
    })

    // Even though the tenant snapshot stub contains a foreign-
    // project row, the response must be empty.
    expect(summary.reports.data?.items).toEqual([])
  })

  it("ranks My Work by priority regardless of DB return order (M1 regression)", async () => {
    // Regression for the QA M1 finding: `work_items.priority` is a
    // `text` column, so a server-side ORDER BY priority DESC sorts
    // alphabetically (medium > low > high > critical). The fix is
    // to skip the server-side priority order and let the JS post-
    // sort be authoritative. This test simulates the DB returning
    // the rows in a low-priority-first order and verifies the
    // critical/high items still surface at the top.
    const supabase = buildSupabase({
      project_memberships: {
        data: [
          {
            project_id: PROJECT_ID,
            projects: {
              id: PROJECT_ID,
              tenant_id: TENANT_ID,
              name: "Alpha",
              project_type: "software",
              project_method: "scrum",
              lifecycle_status: "active",
              responsible_user_id: USER_ID,
              is_deleted: false,
            },
          },
        ],
      },
      tenant_settings: { data: null },
      work_items: {
        // DB returns the rows in the order Postgres would produce
        // for `ORDER BY priority DESC` on a text column: medium →
        // low → high → critical. A future regression that re-adds
        // the server-side sort would still pass IF we accidentally
        // capped on this incoming order — the post-sort must
        // re-rank these so the critical item is first.
        data: [
          {
            id: "wi-medium",
            project_id: PROJECT_ID,
            kind: "task",
            title: "Medium item",
            status: "todo",
            priority: "medium",
            planned_end: "2026-06-10",
          },
          {
            id: "wi-low",
            project_id: PROJECT_ID,
            kind: "task",
            title: "Low item",
            status: "todo",
            priority: "low",
            planned_end: "2026-06-11",
          },
          {
            id: "wi-high",
            project_id: PROJECT_ID,
            kind: "task",
            title: "High item",
            status: "todo",
            priority: "high",
            planned_end: "2026-06-12",
          },
          {
            id: "wi-critical",
            project_id: PROJECT_ID,
            kind: "task",
            title: "Critical item",
            status: "todo",
            priority: "critical",
            planned_end: "2026-06-13",
          },
        ],
      },
      decision_approvers: { data: [] },
      risks: { data: [] },
      milestones: { data: [] },
      report_snapshots: { data: [] },
    })

    const summary = await resolveDashboardSummary({
      supabase,
      userId: USER_ID,
      tenantId: TENANT_ID,
      isTenantAdmin: false,
    })

    const items = summary.my_work.data?.items ?? []
    expect(items.map((r) => r.priority)).toEqual([
      "critical",
      "high",
      "medium",
      "low",
    ])
  })
})
