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
  /**
   * PROJ-58-γ — when the edge maps to a row in `dependencies`,
   * its DB id is exposed so the FE can target the edge directly
   * for DELETE without re-parsing the composite id. `null` for
   * derived/structural edges (belongs_to / influences / etc.).
   */
  dependency_id?: string | null
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
  /**
   * PROJ-65 ε.1 (L13) — opt-in trajectory extension. Present only when
   * the API is called with `?include=trajectory`. Default-PROJ-58 clients
   * never see this field.
   */
  trajectory?: TrajectoryExtension
}

/**
 * PROJ-65 ε.1 — extension payload appended to ProjectGraphSnapshot.
 * Holds method/hybrid hints, sprint + epic structure, compliance lanes,
 * cost lane items, and (placeholder) project goals so the FE
 * `layoutTrajectory` can render the path without a second fetch.
 */
export interface TrajectoryExtension {
  layout_hints: TrajectoryLayoutHints
  sprints: TrajectorySprint[]
  epics: TrajectoryEpic[]
  compliance_lanes: ComplianceLane[]
  cost_lane_items: CostLaneItem[]
  goals: ProjectGoalPlaceholder[]
  /**
   * PROJ-65 ε.2 — assignees per work_item (via PROJ-11 work_item_resources
   * → PROJ-11 resources → PROJ-8 stakeholders). One entry per
   * (work_item, resource) tuple. Soft-deleted stakeholders are present
   * with `deleted_at` set so the FE can render greyed-out (F-5 pattern).
   */
  node_assignees: NodeAssignee[]
  /**
   * PROJ-65 ε.2 — per-project Class-3 cost-clear-view permission.
   * `true` when the current user may see plaintext rates / cost-Δ
   * (per `project_settings.cost_clear_view_permission` from L6).
   * UI uses this only as a render hint — masking is server-enforced.
   */
  cost_clear_view: boolean
}

export interface NodeAssignee {
  work_item_id: string
  resource_id: string
  stakeholder_id: string | null
  /** Display name (stakeholder.name OR resource.display_name fallback). */
  name: string
  /** Stakeholder role_key or resource role. */
  role: string | null
  /** Resource link kind: internal | external | … (PROJ-11). */
  kind: string | null
  /** True when PROJ-43 critical-path flag fires for this assignee. */
  is_critical: boolean
  /** True when sentiment / stakeholder coaching marks this assignee as
   *  advocate / high-cooperation (PROJ-35 sentiment_score > 0.5). */
  is_positive: boolean
  /** True when resource rate exceeds the tenant cost-flag threshold. */
  is_cost_flagged: boolean
  /** Allocation percent on this work_item (0–100). */
  allocation_pct: number | null
  /** Stakeholder soft-delete timestamp; null when active. */
  deleted_at: string | null
}

export interface TrajectoryLayoutHints {
  /** Project method from PROJ-6 catalog (waterfall / scrum / safe / hybrid-*). */
  method: string | null
  /** True when the project uses a mixed method (phases + sprints). */
  hybrid: boolean
  /** Phase ids in display order (sequence_number ascending). */
  phases_order: string[]
  /** Sprint ids in display order (start_date ascending). */
  sprints_order: string[]
  /** Tenant-level flag — controls whether the cost-sidetrack-lane renders at all. */
  budget_module_enabled: boolean
}

export interface TrajectorySprint {
  id: string
  name: string
  start_date: string | null
  end_date: string | null
  state: string | null
}

export interface TrajectoryEpic {
  id: string
  title: string
  status: string | null
  /** Sprint ids that contain at least one story under this epic. */
  sprint_ids: string[]
}

export interface ComplianceLane {
  work_item_id: string
  lane_key: string
  display_label: string | null
}

export interface CostLaneItem {
  id: string
  label: string
  amount_cents: number | null
  currency: string | null
  over_budget: boolean
}

export interface ProjectGoalPlaceholder {
  id: string
  title: string
  status: string
}
