import { beforeEach, describe, expect, it, vi } from "vitest"

import { resolveProjectGraph } from "./aggregate"

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const TENANT_ID = "22222222-2222-4222-8222-222222222222"

interface TableStub {
  data?: unknown
  count?: number
  error?: { message: string } | null
}
function makeChain(stub: TableStub) {
  const final = {
    data: "data" in stub ? stub.data : [],
    count: "count" in stub ? stub.count : null,
    error: stub.error ?? null,
  }
  const chain: Record<string, unknown> = {
    then: (
      onFulfilled: (value: typeof final) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(final).then(onFulfilled, onRejected),
  }
  for (const m of ["select", "eq", "in", "is", "not", "order", "limit"]) {
    ;(chain as Record<string, unknown>)[m] = vi.fn().mockReturnValue(chain)
  }
  ;(chain as Record<string, unknown>).maybeSingle = vi.fn(async () => final)
  return chain
}
function buildSupabase(byTable: Record<string, TableStub>) {
  return {
    from: vi.fn((t: string) => {
      const stub = byTable[t]
      if (!stub) throw new Error(`unexpected from(${t})`)
      return makeChain(stub)
    }),
  } as unknown as Parameters<typeof resolveProjectGraph>[0]["supabase"]
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-05-11T12:00:00.000Z"))
})

describe("resolveProjectGraph", () => {
  it("builds a graph with project + phases + milestones + work items", async () => {
    const supabase = buildSupabase({
      projects: {
        data: {
          id: PROJECT_ID,
          name: "Alpha",
          description: "Demo",
          project_method: "scrum",
          lifecycle_status: "active",
        },
      },
      phases: {
        data: [{ id: "ph-1", name: "Phase 1", status: "active", sequence_number: 1 }],
      },
      milestones: {
        data: [
          {
            id: "ms-1",
            name: "MVP",
            target_date: "2026-09-01",
            status: "planned",
            phase_id: "ph-1",
            is_deleted: false,
          },
        ],
      },
      work_items: {
        data: [
          {
            id: "wi-1",
            kind: "task",
            title: "Setup CI",
            status: "in_progress",
            parent_id: null,
            phase_id: "ph-1",
            milestone_id: null,
            is_deleted: false,
          },
        ],
      },
      dependencies: { data: [] },
      risks: {
        data: [
          {
            id: "rsk-1",
            title: "Vendor lock-in",
            status: "open",
            score: 20,
          },
        ],
      },
      decisions: { data: [] },
      stakeholders: { data: [] },
      budget_items: { count: 3 },
    })

    const snap = await resolveProjectGraph({
      supabase,
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    })
    expect(snap.nodes.length).toBeGreaterThanOrEqual(4) // project + phase + milestone + work_item
    expect(snap.counts.by_node_kind["project"]).toBe(1)
    expect(snap.counts.by_node_kind["phase"]).toBe(1)
    expect(snap.counts.by_node_kind["milestone"]).toBe(1)
    expect(snap.counts.by_node_kind["work_item"]).toBe(1)
    expect(snap.counts.by_node_kind["risk"]).toBe(1)
    // Critical risk (score 20) → tone warning (score >= 16, < 20 is warning; ≥ 20 is critical)
    const riskNode = snap.nodes.find((n) => n.kind === "risk")!
    expect(riskNode.tone).toBe("critical")
    // Budget summary node present when items > 0
    expect(snap.counts.by_node_kind["budget"]).toBe(1)
    // belongs_to edges from work_item / milestone / phase
    expect(snap.counts.by_edge_kind["belongs_to"]).toBeGreaterThanOrEqual(3)
  })

  it("returns an empty snapshot when the project is not found", async () => {
    const supabase = buildSupabase({
      projects: { data: null },
      phases: { data: [] },
      milestones: { data: [] },
      work_items: { data: [] },
      dependencies: { data: [] },
      risks: { data: [] },
      decisions: { data: [] },
      stakeholders: { data: [] },
      budget_items: { count: 0 },
    })
    const snap = await resolveProjectGraph({
      supabase,
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    })
    expect(snap.nodes).toEqual([])
    expect(snap.edges).toEqual([])
  })

  it("drops dependency edges when the target node is missing", async () => {
    const supabase = buildSupabase({
      projects: {
        data: {
          id: PROJECT_ID,
          name: "Alpha",
          description: null,
          project_method: "waterfall",
          lifecycle_status: "active",
        },
      },
      phases: { data: [] },
      milestones: { data: [] },
      work_items: {
        data: [
          {
            id: "wi-1",
            kind: "task",
            title: "Standalone",
            status: "todo",
            parent_id: null,
            phase_id: null,
            milestone_id: null,
            is_deleted: false,
          },
        ],
      },
      dependencies: {
        data: [
          {
            id: "dep-1",
            from_type: "todo",
            from_id: "wi-1",
            to_type: "todo",
            to_id: "wi-missing", // node not in the work_items list
            constraint_type: "FS",
          },
        ],
      },
      risks: { data: [] },
      decisions: { data: [] },
      stakeholders: { data: [] },
      budget_items: { count: 0 },
    })
    const snap = await resolveProjectGraph({
      supabase,
      projectId: PROJECT_ID,
      tenantId: TENANT_ID,
    })
    // The dangling edge to wi-missing must be filtered out.
    expect(snap.counts.by_edge_kind["depends_on"]).toBeUndefined()
  })
})
