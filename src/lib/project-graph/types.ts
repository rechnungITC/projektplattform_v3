/**
 * PROJ-58 — Interactive Project Graph types.
 *
 * MVP node + edge model (2D-first). The shape is library-agnostic
 * (react-flow / cytoscape / d3 all consume `{nodes,edges}` arrays
 * with id + type). When the FE picks a library in a future slice,
 * an adapter sits between this type and the library-specific
 * format.
 */

export type GraphNodeKind =
  | "project"
  | "phase"
  | "milestone"
  | "work_item"
  | "risk"
  | "decision"
  | "stakeholder"
  | "budget"
  | "recommendation"

export type GraphEdgeKind =
  | "belongs_to"
  | "depends_on"
  | "blocks"
  | "unblocks"
  | "influences"
  | "causes_cost"
  | "increases_risk"
  | "requires_stakeholder"

export interface GraphNode {
  id: string
  kind: GraphNodeKind
  label: string
  /** Short hint shown on hover / in side panel. */
  detail: string | null
  /** Severity tone: drives node color in the FE renderer.
   *  - `info`: default neutral.
   *  - `warning`: yellow/amber.
   *  - `critical`: red.
   *  - `success`: green (completed milestones, closed risks). */
  tone: "info" | "warning" | "critical" | "success" | "muted"
  /** Deep link into the domain surface. */
  href: string | null
  /** Domain-specific attributes the FE may render in detail
   *  panels. Kept loose to avoid a new type per node kind. */
  attributes: Record<string, unknown>
}

export interface GraphEdge {
  id: string
  source_node_id: string
  target_node_id: string
  kind: GraphEdgeKind
  label: string | null
}

export interface ProjectGraphSnapshot {
  project_id: string
  generated_at: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  counts: {
    nodes: number
    edges: number
    by_node_kind: Partial<Record<GraphNodeKind, number>>
    by_edge_kind: Partial<Record<GraphEdgeKind, number>>
  }
}
