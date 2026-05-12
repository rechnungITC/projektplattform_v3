import type {
  GraphEdge,
  GraphEdgeKind,
  GraphNode,
  GraphNodeKind,
  ProjectGraphSnapshot,
} from "@/lib/project-graph/types"

export type Graph3DFilterPreset =
  | "all"
  | "delivery"
  | "risk"
  | "stakeholder"
  | "budget"

export type Graph3DEdgeFilter =
  | "all"
  | "dependencies"
  | "blockers"
  | "impact"
  | "stakeholder"

export type Vector3Tuple = [number, number, number]

export interface Graph3DNode {
  id: string
  node: GraphNode
  position: Vector3Tuple
  radius: number
  color: string
  shell: number
  critical: boolean
}

export interface Graph3DEdge {
  id: string
  edge: GraphEdge
  source: Graph3DNode
  target: Graph3DNode
  points: Vector3Tuple[]
  color: string
  opacity: number
  width: number
  critical: boolean
  editable: boolean
  sourceLabel: string
  targetLabel: string
  kindLabel: string
}

export interface ProjectGraph3DScene {
  nodes: Graph3DNode[]
  edges: Graph3DEdge[]
  boundsRadius: number
  warnings: string[]
}

export interface ProjectGraph3DSceneOptions {
  criticalOverlay?: boolean
}

export interface ProjectGraphFilterOptions {
  preset: Graph3DFilterPreset
  edgeFilter: Graph3DEdgeFilter
}

const KIND_ORDER: Exclude<GraphNodeKind, "project">[] = [
  "phase",
  "milestone",
  "work_item",
  "stakeholder",
  "risk",
  "decision",
  "budget",
  "recommendation",
]

export const GRAPH_NODE_KIND_LABEL: Record<GraphNodeKind, string> = {
  project: "Projekt",
  phase: "Phasen",
  milestone: "Meilensteine",
  work_item: "Work Items",
  stakeholder: "Stakeholder",
  risk: "Risiken",
  decision: "Entscheidungen",
  budget: "Budget",
  recommendation: "Vorschlaege",
}

export const GRAPH_EDGE_KIND_LABEL: Record<GraphEdgeKind, string> = {
  belongs_to: "Gehort zu",
  depends_on: "Abhaengigkeit",
  blocks: "Blockiert",
  unblocks: "Entblockt",
  influences: "Beeinflusst",
  causes_cost: "Kostenwirkung",
  increases_risk: "Risikoanstieg",
  requires_stakeholder: "Stakeholder noetig",
}

export const GRAPH_TONE_COLOR: Record<GraphNode["tone"], string> = {
  info: "#2563eb",
  warning: "#d97706",
  critical: "#dc2626",
  success: "#059669",
  muted: "#64748b",
}

export const GRAPH_EDGE_COLOR: Record<GraphEdgeKind, string> = {
  belongs_to: "#64748b",
  depends_on: "#2563eb",
  blocks: "#dc2626",
  unblocks: "#059669",
  influences: "#7c3aed",
  causes_cost: "#ca8a04",
  increases_risk: "#ea580c",
  requires_stakeholder: "#0891b2",
}

const SHELL_LAYOUT: Record<
  Exclude<GraphNodeKind, "project">,
  { radius: number; height: number; shell: number; offset: number }
> = {
  phase: { radius: 2.1, height: 0.45, shell: 1, offset: 0 },
  milestone: { radius: 2.9, height: 1.1, shell: 2, offset: 0.35 },
  work_item: { radius: 4.0, height: -0.15, shell: 3, offset: 0.15 },
  stakeholder: { radius: 5.3, height: 1.7, shell: 4, offset: 0.75 },
  risk: { radius: 5.1, height: -1.55, shell: 4, offset: 0.5 },
  decision: { radius: 6.15, height: 0.75, shell: 5, offset: 0.25 },
  budget: { radius: 6.05, height: -2.25, shell: 5, offset: 0.9 },
  recommendation: { radius: 6.8, height: 2.45, shell: 6, offset: 0.1 },
}

const PRESET_NODE_KINDS: Record<Graph3DFilterPreset, Set<GraphNodeKind>> = {
  all: new Set([
    "project",
    "phase",
    "milestone",
    "work_item",
    "stakeholder",
    "risk",
    "decision",
    "budget",
    "recommendation",
  ]),
  delivery: new Set(["project", "phase", "milestone", "work_item", "decision"]),
  risk: new Set(["project", "milestone", "work_item", "risk", "decision", "recommendation"]),
  stakeholder: new Set(["project", "stakeholder", "decision", "risk", "recommendation"]),
  budget: new Set(["project", "phase", "milestone", "work_item", "budget", "decision"]),
}

const EDGE_FILTER_KINDS: Record<Graph3DEdgeFilter, Set<GraphEdgeKind> | null> = {
  all: null,
  dependencies: new Set(["depends_on", "blocks", "unblocks"]),
  blockers: new Set(["blocks"]),
  impact: new Set(["influences", "causes_cost", "increases_risk"]),
  stakeholder: new Set(["requires_stakeholder"]),
}

export function filterProjectGraphSnapshot(
  snapshot: ProjectGraphSnapshot,
  options: ProjectGraphFilterOptions,
): ProjectGraphSnapshot {
  const allowedKinds = PRESET_NODE_KINDS[options.preset]
  const allowedEdgeKinds = EDGE_FILTER_KINDS[options.edgeFilter]
  const visibleNodeIds = new Set<string>()

  const nodes = snapshot.nodes.filter((node) => {
    const visible = allowedKinds.has(node.kind)
    if (visible) visibleNodeIds.add(node.id)
    return visible
  })

  const edges = snapshot.edges.filter((edge) => {
    if (allowedEdgeKinds && !allowedEdgeKinds.has(edge.kind)) return false
    return (
      visibleNodeIds.has(edge.source_node_id) &&
      visibleNodeIds.has(edge.target_node_id)
    )
  })

  return {
    ...snapshot,
    nodes,
    edges,
    counts: {
      nodes: nodes.length,
      edges: edges.length,
      by_node_kind: countBy(nodes, (node) => node.kind),
      by_edge_kind: countBy(edges, (edge) => edge.kind),
    },
  }
}

export function buildProjectGraph3DScene(
  snapshot: ProjectGraphSnapshot,
  options: ProjectGraph3DSceneOptions = {},
): ProjectGraph3DScene {
  const positions = computeGraph3DPositions(snapshot.nodes)
  const nodeById = new Map<string, Graph3DNode>()
  const nodes: Graph3DNode[] = []

  for (const node of snapshot.nodes) {
    const position = positions.get(node.id)
    if (!position) continue
    const sceneNode: Graph3DNode = {
      id: node.id,
      node,
      position,
      radius: node.kind === "project" ? 0.34 : 0.18,
      color: GRAPH_TONE_COLOR[node.tone],
      shell: node.kind === "project" ? 0 : SHELL_LAYOUT[node.kind].shell,
      critical: isCriticalNode(node),
    }
    nodes.push(sceneNode)
    nodeById.set(node.id, sceneNode)
  }

  const edges: Graph3DEdge[] = []
  for (const [index, edge] of snapshot.edges.entries()) {
    const source = nodeById.get(edge.source_node_id)
    const target = nodeById.get(edge.target_node_id)
    if (!source || !target) continue
    const critical = source.critical && target.critical
    edges.push({
      id: edge.id,
      edge,
      source,
      target,
      points: curveEdge(source.position, target.position, index, edge.kind),
      color: critical ? GRAPH_EDGE_COLOR.blocks : GRAPH_EDGE_COLOR[edge.kind],
      opacity: options.criticalOverlay && !critical ? 0.18 : 0.86,
      width: critical ? 2.6 : edge.kind === "blocks" ? 2.2 : 1.5,
      critical,
      editable: edge.dependency_id != null,
      sourceLabel: source.node.label,
      targetLabel: target.node.label,
      kindLabel: GRAPH_EDGE_KIND_LABEL[edge.kind],
    })
  }

  const boundsRadius = Math.max(
    7.5,
    ...nodes.map((node) => vectorLength(node.position) + node.radius),
  )

  const warnings: string[] = []
  if (snapshot.nodes.length > 250 || snapshot.edges.length > 500) {
    warnings.push("large-graph-lod")
  }

  return { nodes, edges, boundsRadius, warnings }
}

export function isCriticalNode(node: GraphNode): boolean {
  return Boolean(
    (node.attributes as { is_critical?: boolean } | undefined)?.is_critical,
  )
}

export function computeGraph3DPositions(
  nodes: GraphNode[],
): Map<string, Vector3Tuple> {
  const positions = new Map<string, Vector3Tuple>()
  const projectNode = nodes.find((node) => node.kind === "project")
  if (projectNode) positions.set(projectNode.id, [0, 0, 0])

  const grouped = new Map<GraphNodeKind, GraphNode[]>()
  for (const node of nodes) {
    if (node.kind === "project") continue
    const bucket = grouped.get(node.kind) ?? []
    bucket.push(node)
    grouped.set(node.kind, bucket)
  }

  for (const kind of KIND_ORDER) {
    const bucket = grouped.get(kind)
    if (!bucket?.length) continue
    const layout = SHELL_LAYOUT[kind]
    bucket.forEach((node, index) => {
      const angle =
        (Math.PI * 2 * index) / bucket.length - Math.PI / 2 + layout.offset
      const radialWave = bucket.length > 8 ? (index % 3) * 0.22 : 0
      positions.set(node.id, [
        (layout.radius + radialWave) * Math.cos(angle),
        layout.height + (index % 2 === 0 ? 0 : 0.18),
        (layout.radius + radialWave) * Math.sin(angle),
      ])
    })
  }

  return positions
}

function curveEdge(
  start: Vector3Tuple,
  end: Vector3Tuple,
  index: number,
  kind: GraphEdgeKind,
): Vector3Tuple[] {
  const midpoint: Vector3Tuple = [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
    (start[2] + end[2]) / 2,
  ]
  const typeLift =
    kind === "blocks" || kind === "increases_risk"
      ? 0.58
      : kind === "causes_cost"
        ? -0.28
        : 0.34
  const fan = ((index % 5) - 2) * 0.08
  const dx = end[0] - start[0]
  const dz = end[2] - start[2]
  const planarLength = Math.max(0.001, Math.hypot(dx, dz))
  const normalX = -dz / planarLength
  const normalZ = dx / planarLength

  return [
    start,
    [
      midpoint[0] + normalX * fan,
      midpoint[1] + typeLift + Math.min(0.7, vectorDistance(start, end) * 0.035),
      midpoint[2] + normalZ * fan,
    ],
    end,
  ]
}

function countBy<T, K extends string>(
  values: T[],
  getKey: (value: T) => K,
): Partial<Record<K, number>> {
  return values.reduce<Partial<Record<K, number>>>((acc, value) => {
    const key = getKey(value)
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
}

function vectorLength(value: Vector3Tuple): number {
  return Math.hypot(value[0], value[1], value[2])
}

function vectorDistance(a: Vector3Tuple, b: Vector3Tuple): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}
