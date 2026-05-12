import { describe, expect, it } from "vitest"

import {
  buildProjectGraph3DScene,
  computeGraph3DPositions,
  filterProjectGraphSnapshot,
} from "@/lib/project-graph/three-adapter"
import type { ProjectGraphSnapshot } from "@/lib/project-graph/types"

const snapshot: ProjectGraphSnapshot = {
  project_id: "project-1",
  generated_at: "2026-05-12T00:00:00.000Z",
  nodes: [
    node("project:1", "project", "Projekt", "info"),
    node("phase:1", "phase", "Phase", "info"),
    node("work:1", "work_item", "Story A", "warning", true),
    node("work:2", "work_item", "Story B", "warning", true),
    node("risk:1", "risk", "Risiko", "critical"),
    node("stakeholder:1", "stakeholder", "Sponsor", "muted"),
    node("budget:1", "budget", "Budget", "success"),
  ],
  edges: [
    edge("e1", "project:1", "phase:1", "belongs_to"),
    edge("e2", "work:1", "work:2", "blocks", "dep-1"),
    edge("e3", "risk:1", "work:2", "increases_risk"),
    edge("e4", "stakeholder:1", "work:1", "requires_stakeholder"),
    edge("e5", "budget:1", "work:2", "causes_cost"),
  ],
  counts: {
    nodes: 7,
    edges: 5,
    by_node_kind: {
      project: 1,
      phase: 1,
      work_item: 2,
      risk: 1,
      stakeholder: 1,
      budget: 1,
    },
    by_edge_kind: {
      belongs_to: 1,
      blocks: 1,
      increases_risk: 1,
      requires_stakeholder: 1,
      causes_cost: 1,
    },
  },
}

describe("project graph three adapter", () => {
  it("creates deterministic domain shells with project in the center", () => {
    const positions = computeGraph3DPositions(snapshot.nodes)

    expect(positions.get("project:1")).toEqual([0, 0, 0])
    expect(positions.get("phase:1")?.[1]).toBeCloseTo(0.45)
    expect(positions.get("work:1")?.[1]).toBeCloseTo(-0.15)
    expect(positions.get("risk:1")?.[1]).toBeCloseTo(-1.55)
  })

  it("filters nodes and edges by management preset without dangling edges", () => {
    const filtered = filterProjectGraphSnapshot(snapshot, {
      preset: "risk",
      edgeFilter: "impact",
    })

    expect(filtered.nodes.map((node) => node.kind).sort()).toEqual([
      "project",
      "risk",
      "work_item",
      "work_item",
    ])
    expect(filtered.edges).toHaveLength(1)
    expect(filtered.edges[0]?.kind).toBe("increases_risk")
    expect(filtered.counts.edges).toBe(1)
  })

  it("marks critical editable edges and dims off-path edges in overlay mode", () => {
    const scene = buildProjectGraph3DScene(snapshot, { criticalOverlay: true })
    const blocker = scene.edges.find((edge) => edge.id === "e2")
    const risk = scene.edges.find((edge) => edge.id === "e3")

    expect(blocker?.critical).toBe(true)
    expect(blocker?.editable).toBe(true)
    expect(blocker?.opacity).toBeGreaterThan(0.8)
    expect(risk?.critical).toBe(false)
    expect(risk?.opacity).toBeLessThan(0.3)
    expect(scene.boundsRadius).toBeGreaterThan(6)
  })
})

function node(
  id: string,
  kind: ProjectGraphSnapshot["nodes"][number]["kind"],
  label: string,
  tone: ProjectGraphSnapshot["nodes"][number]["tone"],
  critical = false,
): ProjectGraphSnapshot["nodes"][number] {
  return {
    id,
    kind,
    label,
    detail: null,
    tone,
    href: null,
    attributes: critical ? { is_critical: true } : {},
  }
}

function edge(
  id: string,
  source_node_id: string,
  target_node_id: string,
  kind: ProjectGraphSnapshot["edges"][number]["kind"],
  dependency_id: string | null = null,
): ProjectGraphSnapshot["edges"][number] {
  return {
    id,
    source_node_id,
    target_node_id,
    kind,
    label: null,
    dependency_id,
  }
}
