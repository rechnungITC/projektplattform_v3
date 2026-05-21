/**
 * PROJ-65 ε.1 — tests for the pure trajectory layout engine.
 */
import { describe, expect, it } from "vitest"

import { findCycleEdges, layoutTrajectory } from "./trajectory-layout"
import type { GraphEdge, ProjectGraphSnapshot } from "./types"

function baseSnapshot(
  overrides: Partial<ProjectGraphSnapshot> = {},
): ProjectGraphSnapshot {
  return {
    project_id: "p1",
    generated_at: "2026-05-19T00:00:00Z",
    nodes: [],
    edges: [],
    counts: { nodes: 0, edges: 0, by_node_kind: {}, by_edge_kind: {} },
    ...overrides,
  }
}

describe("layoutTrajectory", () => {
  it("returns an empty layout when no trajectory extension is present", () => {
    const layout = layoutTrajectory(baseSnapshot())
    expect(layout.lanes).toHaveLength(0)
    expect(layout.nodes).toHaveLength(0)
    expect(layout.cycle_count).toBe(0)
  })

  it("renders only the phase lane for waterfall-only projects", () => {
    const layout = layoutTrajectory(
      baseSnapshot({
        nodes: [
          {
            id: "phase:p1",
            kind: "phase",
            label: "Init",
            detail: null,
            tone: "info",
            href: null,
            attributes: { sequence_number: 1 },
          },
        ],
        trajectory: {
          layout_hints: {
            method: "waterfall",
            hybrid: false,
            phases_order: ["p1"],
            sprints_order: [],
            budget_module_enabled: false,
          },
          sprints: [],
          epics: [],
          compliance_lanes: [],
          cost_lane_items: [],
          goals: [],
          node_assignees: [],
          cost_clear_view: false,
        },
      }),
    )
    const kinds = layout.lanes.map((l) => l.kind)
    expect(kinds).toEqual(["phase"])
    // start + phase nodes
    expect(layout.nodes.find((n) => n.kind === "project_start")).toBeTruthy()
    expect(layout.nodes.find((n) => n.kind === "phase")?.label).toBe("Init")
  })

  it("renders both phase and sprint lanes for hybrid projects", () => {
    const layout = layoutTrajectory(
      baseSnapshot({
        nodes: [
          {
            id: "phase:p1",
            kind: "phase",
            label: "Init",
            detail: null,
            tone: "info",
            href: null,
            attributes: { sequence_number: 1 },
          },
        ],
        trajectory: {
          layout_hints: {
            method: "hybrid-scrum-waterfall",
            hybrid: true,
            phases_order: ["p1"],
            sprints_order: ["s1"],
            budget_module_enabled: false,
          },
          sprints: [
            {
              id: "s1",
              name: "Sprint 1",
              start_date: "2026-05-19",
              end_date: null,
              state: "active",
            },
          ],
          epics: [],
          compliance_lanes: [],
          cost_lane_items: [],
          goals: [],
          node_assignees: [],
          cost_clear_view: false,
        },
      }),
    )
    const kinds = layout.lanes.map((l) => l.kind)
    expect(kinds).toContain("phase")
    expect(kinds).toContain("sprint")
  })

  it("renders epic sub-row only when epics have sprint assignments", () => {
    const layout = layoutTrajectory(
      baseSnapshot({
        trajectory: {
          layout_hints: {
            method: "scrum",
            hybrid: false,
            phases_order: [],
            sprints_order: ["s1"],
            budget_module_enabled: false,
          },
          sprints: [
            {
              id: "s1",
              name: "Sprint 1",
              start_date: null,
              end_date: null,
              state: null,
            },
          ],
          epics: [
            { id: "e1", title: "Epic 1", status: null, sprint_ids: ["s1"] },
            { id: "e2", title: "Epic 2", status: null, sprint_ids: [] },
          ],
          compliance_lanes: [],
          cost_lane_items: [],
          goals: [],
          node_assignees: [],
          cost_clear_view: false,
        },
      }),
    )
    expect(layout.lanes.find((l) => l.kind === "epic")).toBeTruthy()
    expect(layout.lanes.find((l) => l.kind === "epic")?.item_count).toBe(1)
    expect(layout.nodes.find((n) => n.id === "epic:e1")).toBeTruthy()
    expect(layout.nodes.find((n) => n.id === "epic:e2")).toBeFalsy()
  })

  it("renders the cost lane in empty-state when budget module is on but no items exist", () => {
    const layout = layoutTrajectory(
      baseSnapshot({
        trajectory: {
          layout_hints: {
            method: "scrum",
            hybrid: false,
            phases_order: [],
            sprints_order: ["s1"],
            budget_module_enabled: true,
          },
          sprints: [
            {
              id: "s1",
              name: "Sprint 1",
              start_date: null,
              end_date: null,
              state: null,
            },
          ],
          epics: [],
          compliance_lanes: [],
          cost_lane_items: [],
          goals: [],
          node_assignees: [],
          cost_clear_view: false,
        },
      }),
    )
    const costLane = layout.lanes.find((l) => l.kind === "cost")
    expect(costLane).toBeTruthy()
    expect(costLane?.cost_state).toBe("empty")
  })

  it("hides the cost lane entirely when budget module is disabled", () => {
    const layout = layoutTrajectory(
      baseSnapshot({
        trajectory: {
          layout_hints: {
            method: "scrum",
            hybrid: false,
            phases_order: [],
            sprints_order: ["s1"],
            budget_module_enabled: false,
          },
          sprints: [
            {
              id: "s1",
              name: "Sprint 1",
              start_date: null,
              end_date: null,
              state: null,
            },
          ],
          epics: [],
          compliance_lanes: [],
          cost_lane_items: [
            {
              id: "b1",
              label: "Server",
              amount_cents: 1000,
              currency: "EUR",
              over_budget: false,
            },
          ],
          goals: [],
          node_assignees: [],
          cost_clear_view: false,
        },
      }),
    )
    expect(layout.lanes.find((l) => l.kind === "cost")).toBeFalsy()
  })

  it("renders compliance lanes for each distinct lane_key in tenant order", () => {
    const layout = layoutTrajectory(
      baseSnapshot({
        nodes: [
          {
            id: "work_item:wi1",
            kind: "work_item",
            label: "Task",
            detail: null,
            tone: "info",
            href: null,
            attributes: { kind: "task" },
          },
          {
            id: "work_item:wi2",
            kind: "work_item",
            label: "Task 2",
            detail: null,
            tone: "info",
            href: null,
            attributes: { kind: "task" },
          },
        ],
        trajectory: {
          layout_hints: {
            method: "waterfall",
            hybrid: false,
            phases_order: [],
            sprints_order: [],
            budget_module_enabled: false,
          },
          sprints: [],
          epics: [],
          compliance_lanes: [
            { work_item_id: "wi1", lane_key: "iso27001", display_label: null },
            { work_item_id: "wi2", lane_key: "dsgvo", display_label: null },
          ],
          cost_lane_items: [],
          goals: [],
          node_assignees: [],
          cost_clear_view: false,
        },
      }),
      { compliance_lane_order: ["dsgvo", "iso27001"] },
    )
    const complianceLanes = layout.lanes.filter(
      (l) => l.kind === "compliance",
    )
    expect(complianceLanes.map((l) => l.id)).toEqual([
      "lane:compliance:dsgvo",
      "lane:compliance:iso27001",
    ])
  })

  it("aggregates risk / decision / ai-recommendation counts per anchor node", () => {
    const layout = layoutTrajectory(
      baseSnapshot({
        nodes: [
          {
            id: "phase:p1",
            kind: "phase",
            label: "Init",
            detail: null,
            tone: "info",
            href: null,
            attributes: { sequence_number: 1 },
          },
          {
            id: "risk:r1",
            kind: "risk",
            label: "R1",
            detail: null,
            tone: "warning",
            href: null,
            attributes: {},
          },
          {
            id: "decision:d1",
            kind: "decision",
            label: "D1",
            detail: null,
            tone: "info",
            href: null,
            attributes: {},
          },
          {
            id: "recommendation:rec1",
            kind: "recommendation",
            label: "AI",
            detail: null,
            tone: "muted",
            href: null,
            attributes: {},
          },
        ],
        edges: [
          {
            id: "increases_risk:risk:r1→phase:p1",
            source_node_id: "risk:r1",
            target_node_id: "phase:p1",
            kind: "increases_risk",
            label: null,
          },
          {
            id: "influences:decision:d1→phase:p1",
            source_node_id: "decision:d1",
            target_node_id: "phase:p1",
            kind: "influences",
            label: null,
          },
          {
            id: "influences:recommendation:rec1→phase:p1",
            source_node_id: "recommendation:rec1",
            target_node_id: "phase:p1",
            kind: "influences",
            label: null,
          },
        ],
        trajectory: {
          layout_hints: {
            method: "waterfall",
            hybrid: false,
            phases_order: ["p1"],
            sprints_order: [],
            budget_module_enabled: false,
          },
          sprints: [],
          epics: [],
          compliance_lanes: [],
          cost_lane_items: [],
          goals: [],
          node_assignees: [],
          cost_clear_view: false,
        },
      }),
    )
    const phase = layout.nodes.find((n) => n.id === "phase:p1")
    expect(phase?.risk_count).toBe(1)
    expect(phase?.decision_count).toBe(1)
    expect(phase?.ai_recommendation_count).toBe(1)
  })

  it("excludes cycle edges and reports cycle_count > 0", () => {
    const layout = layoutTrajectory(
      baseSnapshot({
        nodes: [
          {
            id: "work_item:a",
            kind: "work_item",
            label: "A",
            detail: null,
            tone: "info",
            href: null,
            attributes: {},
          },
          {
            id: "work_item:b",
            kind: "work_item",
            label: "B",
            detail: null,
            tone: "info",
            href: null,
            attributes: {},
          },
        ],
        edges: [
          {
            id: "e1",
            source_node_id: "work_item:a",
            target_node_id: "work_item:b",
            kind: "depends_on",
            label: null,
          },
          {
            id: "e2",
            source_node_id: "work_item:b",
            target_node_id: "work_item:a",
            kind: "depends_on",
            label: null,
          },
        ],
        trajectory: {
          layout_hints: {
            method: "scrum",
            hybrid: false,
            phases_order: [],
            sprints_order: [],
            budget_module_enabled: false,
          },
          sprints: [],
          epics: [],
          compliance_lanes: [],
          cost_lane_items: [],
          goals: [],
          node_assignees: [],
          cost_clear_view: false,
        },
      }),
    )
    expect(layout.cycle_edges.map((e) => e.id).sort()).toEqual(["e1", "e2"])
    expect(layout.cycle_count).toBeGreaterThan(0)
    expect(layout.edges.find((e) => e.id === "e1")).toBeFalsy()
  })
})

describe("layoutTrajectory — green-path attribute pass-through", () => {
  it("reads is_on_green_path from snapshot attributes onto positioned nodes", () => {
    const layout = layoutTrajectory(
      baseSnapshot({
        nodes: [
          {
            id: "phase:p1",
            kind: "phase",
            label: "Init",
            detail: null,
            tone: "info",
            href: null,
            attributes: { sequence_number: 1, is_on_green_path: true },
          },
        ],
        trajectory: {
          layout_hints: {
            method: "waterfall",
            hybrid: false,
            phases_order: ["p1"],
            sprints_order: [],
            budget_module_enabled: false,
          },
          sprints: [],
          epics: [],
          compliance_lanes: [],
          cost_lane_items: [],
          goals: [],
          node_assignees: [],
          cost_clear_view: false,
        },
      }),
    )
    const phase = layout.nodes.find((n) => n.kind === "phase")
    expect(
      (phase?.attributes as { is_on_green_path?: boolean })
        ?.is_on_green_path,
    ).toBe(true)
  })
})

describe("findCycleEdges", () => {
  const edge = (
    id: string,
    from: string,
    to: string,
  ): GraphEdge => ({
    id,
    source_node_id: from,
    target_node_id: to,
    kind: "depends_on",
    label: null,
  })

  it("returns no cycles for a DAG", () => {
    const result = findCycleEdges([
      edge("e1", "a", "b"),
      edge("e2", "b", "c"),
    ])
    expect(result.size).toBe(0)
  })

  it("detects a 2-node cycle", () => {
    const result = findCycleEdges([
      edge("e1", "a", "b"),
      edge("e2", "b", "a"),
    ])
    expect(result.size).toBe(2)
  })

  it("detects a 3-node cycle and leaves DAG edges untouched", () => {
    const result = findCycleEdges([
      edge("e1", "a", "b"),
      edge("e2", "b", "c"),
      edge("e3", "c", "a"),
      edge("e4", "a", "x"),
      edge("e5", "x", "y"),
    ])
    expect(result.has("e1")).toBe(true)
    expect(result.has("e2")).toBe(true)
    expect(result.has("e3")).toBe(true)
    expect(result.has("e4")).toBe(false)
    expect(result.has("e5")).toBe(false)
  })

  it("detects a self-loop", () => {
    const result = findCycleEdges([edge("e1", "a", "a")])
    expect(result.has("e1")).toBe(true)
  })
})
