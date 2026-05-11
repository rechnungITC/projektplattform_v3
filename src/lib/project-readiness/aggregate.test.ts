import { beforeEach, describe, expect, it, vi } from "vitest"

import { resolveProjectReadiness } from "./aggregate"

// PROJ-56 — readiness aggregator unit tests.
//
// Strategy:
//   - Stub Supabase per-table with a single chain that resolves to
//     `{ count, error }` for HEAD queries and `{ data, error }` for
//     SELECTs. The chain is `then`-able so `await` works on the
//     terminal `.eq(...)` / `.not(...)`. The terminal call is
//     captured per-table via `byTable`.
//
// Covers:
//   - Brand-new project: scrum, no signals → state=not_ready, blocker
//     on responsible_user_id and project_method.
//   - Fully populated scrum project → state=ready.
//   - Waterfall project missing phases but with sprints → schedule
//     gap surfaces as warning.
//   - Modules disabled (budget/risks/output_rendering) → those rows
//     are not_applicable, not open.

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const TENANT_ID = "22222222-2222-4222-8222-222222222222"

interface TableStub {
  data?: unknown
  count?: number
  error?: { message: string } | null
}

function makeChain(stub: TableStub) {
  const final = {
    data: "data" in stub ? stub.data : null,
    count: "count" in stub ? stub.count : null,
    error: stub.error ?? null,
  }
  const chain: Record<string, unknown> = {
    then: (
      onFulfilled: (value: typeof final) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(final).then(onFulfilled, onRejected),
  }
  for (const method of ["select", "eq", "not", "is", "in", "order", "limit"]) {
    ;(chain as Record<string, unknown>)[method] = vi
      .fn()
      .mockReturnValue(chain)
  }
  ;(chain as Record<string, unknown>).maybeSingle = vi.fn(async () => final)
  return chain
}

function buildSupabase(byTable: Record<string, TableStub>) {
  return {
    from: vi.fn((table: string) => {
      const stub = byTable[table]
      if (!stub) throw new Error(`unexpected from(${table})`)
      return makeChain(stub)
    }),
  } as unknown as Parameters<typeof resolveProjectReadiness>[0]["supabase"]
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-05-11T12:00:00.000Z"))
})

describe("resolveProjectReadiness", () => {
  it("flags a brand-new scrum project as not_ready with blockers", async () => {
    const supabase = buildSupabase({
      projects: {
        data: {
          id: PROJECT_ID,
          name: "Alpha",
          description: null,
          project_method: null, // no method chosen yet → blocker
          lifecycle_status: "draft",
          planned_start_date: null,
          planned_end_date: null,
          responsible_user_id: null, // no lead → blocker
        },
      },
      tenant_settings: { data: null },
      project_memberships: { count: 0 },
      phases: { count: 0 },
      sprints: { count: 0 },
      stakeholders: { count: 0 },
      risks: { count: 0 },
      budget_items: { count: 0 },
      report_snapshots: { count: 0 },
      resources: { data: [] },
    })

    const snap = await resolveProjectReadiness({
      supabase,
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    })
    expect(snap.state).toBe("not_ready")
    expect(snap.counts.open_blockers).toBeGreaterThanOrEqual(2)
    // project_method + responsible_user are blockers
    const blockers = snap.items.filter(
      (i) => i.status === "open" && i.severity === "blocker",
    )
    expect(blockers.map((b) => b.key)).toEqual(
      expect.arrayContaining(["project_method", "responsible_user"]),
    )
    expect(snap.next_actions.length).toBeGreaterThan(0)
    // Blockers come first in next_actions ordering.
    expect(snap.next_actions[0].severity).toBe("blocker")
  })

  it("reports ready when every relevant signal is satisfied", async () => {
    const supabase = buildSupabase({
      projects: {
        data: {
          id: PROJECT_ID,
          name: "Alpha",
          description: "Ein Implementierungsprojekt für ERP-Migration.",
          project_method: "scrum",
          lifecycle_status: "active",
          planned_start_date: "2026-01-01",
          planned_end_date: "2026-12-31",
          responsible_user_id: "user-1",
        },
      },
      tenant_settings: { data: null },
      project_memberships: { count: 4 },
      phases: { count: 0 },
      sprints: { count: 3 },
      stakeholders: { count: 5 },
      risks: { count: 2 },
      budget_items: { count: 8 },
      report_snapshots: { count: 1 },
      resources: { data: [] },
    })

    const snap = await resolveProjectReadiness({
      supabase,
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    })
    expect(snap.state).toBe("ready")
    expect(snap.counts.open_blockers).toBe(0)
    expect(snap.counts.open_warnings).toBe(0)
    expect(snap.next_actions).toHaveLength(0)
  })

  it("flags waterfall projects without phases as ready_with_gaps (warning)", async () => {
    const supabase = buildSupabase({
      projects: {
        data: {
          id: PROJECT_ID,
          name: "Alpha",
          description: "Ein Wasserfall-Projekt.",
          project_method: "waterfall",
          lifecycle_status: "active",
          planned_start_date: "2026-01-01",
          planned_end_date: "2026-12-31",
          responsible_user_id: "user-1",
        },
      },
      tenant_settings: { data: null },
      project_memberships: { count: 1 },
      phases: { count: 0 }, // waterfall ohne Phasen → Warnung
      sprints: { count: 0 },
      stakeholders: { count: 2 },
      risks: { count: 1 },
      budget_items: { count: 3 },
      report_snapshots: { count: 0 },
      resources: { data: [] },
    })

    const snap = await resolveProjectReadiness({
      supabase,
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    })
    expect(snap.state).toBe("ready_with_gaps")
    const scheduleItem = snap.items.find((i) => i.key === "schedule_units")
    expect(scheduleItem?.status).toBe("open")
    expect(scheduleItem?.severity).toBe("warning")
    expect(scheduleItem?.label).toContain("Phasen")
  })

  it("treats disabled modules as not_applicable, not open", async () => {
    const supabase = buildSupabase({
      projects: {
        data: {
          id: PROJECT_ID,
          name: "Alpha",
          description: "Lean project.",
          project_method: "kanban",
          lifecycle_status: "active",
          planned_start_date: "2026-01-01",
          planned_end_date: "2026-12-31",
          responsible_user_id: "user-1",
        },
      },
      // Tenant has every module DISABLED.
      tenant_settings: { data: { active_modules: [] } },
      project_memberships: { count: 2 },
      phases: { count: 0 },
      sprints: { count: 0 },
      stakeholders: { count: 1 },
      risks: { count: 0 }, // module off — must be not_applicable
      budget_items: { count: 0 }, // module off
      report_snapshots: { count: 0 },
      resources: { data: [] }, // module off
    })

    const snap = await resolveProjectReadiness({
      supabase,
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    })
    const byKey = Object.fromEntries(snap.items.map((i) => [i.key, i]))
    expect(byKey["budget_planned"].status).toBe("not_applicable")
    expect(byKey["risks_captured"].status).toBe("not_applicable")
    expect(byKey["report_snapshot_created"].status).toBe("not_applicable")
    expect(snap.counts.not_applicable).toBeGreaterThanOrEqual(3)
  })
})
