/**
 * PROJ-65 ε.1 — pure-function trajectory layout engine (L14).
 *
 * Input: a `ProjectGraphSnapshot` with the optional `trajectory`
 * extension. Output: positioned nodes + routed edges grouped into
 * lanes, ready to render in SVG (or to feed a 3D projection).
 *
 * Two algorithms:
 *   1. Tarjan-SCC (L5)  — detect cycles in the `depends_on` edge
 *      subgraph. Edges that participate in a cycle are excluded
 *      from the layout and surfaced via `cycle_edges` so the
 *      UI can render the cycle-banner.
 *   2. Sugiyama-lite     — topological lane-layered layout. Each
 *      lane (phase / sprint / cost / compliance) is a horizontal
 *      band; nodes inside a lane are placed at x = topo-rank * step.
 *
 * The function is deterministic and side-effect-free; the resulting
 * coordinates are unitless (consumer scales for SVG / 3D).
 */

import type {
  ComplianceLane,
  CostLaneItem,
  GraphEdge,
  GraphNode,
  ProjectGraphSnapshot,
  TrajectoryEpic,
  TrajectorySprint,
} from "./types"

export type TrajectoryLaneKind =
  | "phase"
  | "epic"
  | "sprint"
  | "cost"
  | "compliance"
  /**
   * `"goal"` is a positioning hint, not an actual lane. Goal nodes are
   * right-anchored outside the lane grid; this kind marks them so the
   * renderer can pick a goal-specific visual treatment without a
   * separate `kind` field on `PositionedNode.lane_kind`.
   */
  | "goal"

export type TrajectoryNodeKind =
  | "project_start"
  | "phase"
  | "milestone"
  | "epic"
  | "sprint"
  | "work_item"
  | "goal"
  | "budget"

export interface PositionedNode {
  id: string
  /** Original snapshot node id (or synthetic id for project_start / goal). */
  source_id: string
  kind: TrajectoryNodeKind
  label: string
  detail: string | null
  x: number
  y: number
  width: number
  height: number
  lane_id: string
  lane_kind: TrajectoryLaneKind
  is_critical: boolean
  /** Aggregated counts for badge rendering. */
  risk_count: number
  decision_count: number
  ai_recommendation_count: number
  /** Original snapshot attributes (status, kind, etc.). */
  attributes: Record<string, unknown>
  href: string | null
}

export interface RoutedEdge {
  id: string
  source_node_id: string
  target_node_id: string
  kind: GraphEdge["kind"]
  is_critical: boolean
  /** Crosses lane boundaries — render slightly thicker / curved. */
  inter_lane: boolean
}

export interface TrajectoryLane {
  id: string
  kind: TrajectoryLaneKind
  /** Stable order index — lanes stack top-to-bottom. */
  order: number
  label: string
  icon: string
  /** Custom display label for compliance lanes (DSGVO, ISO27001, custom). */
  display_label?: string
  /** Number of items in the lane (for header counter). */
  item_count: number
  /** Y-position of lane center; height defaults to LANE_HEIGHT[kind]. */
  y: number
  height: number
  /**
   * For the cost lane only: whether the lane should render an empty-state.
   * `null` for lanes that are not the cost lane.
   */
  cost_state?: "items" | "empty"
}

export interface TrajectoryLayout {
  width: number
  height: number
  lanes: TrajectoryLane[]
  nodes: PositionedNode[]
  edges: RoutedEdge[]
  /** Edges that were excluded because they participate in a cycle (L5). */
  cycle_edges: GraphEdge[]
  /** Distinct cycle count for the UI banner. */
  cycle_count: number
}

const LANE_HEIGHT: Record<TrajectoryLaneKind, number> = {
  phase: 88,
  epic: 36,
  sprint: 88,
  cost: 64,
  compliance: 56,
  // `goal` is not an actual lane; height value is unused but the
  // record completeness keeps `pushLane` type-safe.
  goal: 0,
}

const COST_EMPTY_HEIGHT = 56

const NODE_SIZE: Record<TrajectoryNodeKind, { w: number; h: number }> = {
  project_start: { w: 32, h: 32 },
  phase: { w: 120, h: 40 },
  milestone: { w: 28, h: 28 },
  epic: { w: 120, h: 28 },
  sprint: { w: 96, h: 40 },
  work_item: { w: 88, h: 36 },
  goal: { w: 64, h: 44 },
  budget: { w: 80, h: 32 },
}

const COL_STEP = 152
const LEFT_PAD = 72
const RIGHT_PAD = 96

export interface LayoutTrajectoryOptions {
  /** Compliance lane keys to render in tenant-defined order. */
  compliance_lane_order?: string[]
}

export function layoutTrajectory(
  snapshot: ProjectGraphSnapshot,
  options: LayoutTrajectoryOptions = {},
): TrajectoryLayout {
  const extension = snapshot.trajectory
  if (!extension) {
    return emptyLayout()
  }

  const hints = extension.layout_hints
  const hasPhases = hints.phases_order.length > 0
  const hasSprints = extension.sprints.length > 0

  // ── Lane construction ────────────────────────────────────────────
  const lanes: TrajectoryLane[] = []
  let laneOrder = 0
  let cursorY = 32 // top padding

  function pushLane(
    lane: Omit<TrajectoryLane, "order" | "y" | "height"> & {
      height?: number
    },
  ) {
    const height = lane.height ?? LANE_HEIGHT[lane.kind]
    lanes.push({
      ...lane,
      height,
      order: laneOrder++,
      y: cursorY + height / 2,
    })
    cursorY += height + 16 // gap between lanes
  }

  if (hasPhases) {
    pushLane({
      id: "lane:phase",
      kind: "phase",
      label: "Phasen",
      icon: "timeline",
      item_count: hints.phases_order.length,
      height: LANE_HEIGHT.phase,
    })
  }

  if (hasSprints) {
    // Epic sub-row only when at least one epic exists with sprint_ids.
    const epicsWithSprints = extension.epics.filter((e) => e.sprint_ids.length > 0)
    if (epicsWithSprints.length > 0) {
      pushLane({
        id: "lane:epic",
        kind: "epic",
        label: "Epics",
        icon: "bookmark",
        item_count: epicsWithSprints.length,
        height: LANE_HEIGHT.epic,
      })
    }
    pushLane({
      id: "lane:sprint",
      kind: "sprint",
      label: "Sprints",
      icon: "flag",
      item_count: extension.sprints.length,
      height: LANE_HEIGHT.sprint,
    })
  }

  if (hints.budget_module_enabled) {
    const hasItems = extension.cost_lane_items.length > 0
    pushLane({
      id: "lane:cost",
      kind: "cost",
      label: "Budget",
      icon: "payments",
      item_count: extension.cost_lane_items.length,
      height: hasItems ? LANE_HEIGHT.cost : COST_EMPTY_HEIGHT,
      cost_state: hasItems ? "items" : "empty",
    })
  }

  // Compliance lanes: group by lane_key, custom tenant order if provided.
  const complianceByKey = new Map<string, ComplianceLane[]>()
  for (const row of extension.compliance_lanes) {
    const entries = complianceByKey.get(row.lane_key) ?? []
    entries.push(row)
    complianceByKey.set(row.lane_key, entries)
  }
  const complianceKeys = sortComplianceKeys(
    Array.from(complianceByKey.keys()),
    options.compliance_lane_order ?? [],
  )
  for (const key of complianceKeys) {
    const entries = complianceByKey.get(key) ?? []
    pushLane({
      id: `lane:compliance:${key}`,
      kind: "compliance",
      label: complianceLaneLabel(key),
      icon: complianceLaneIcon(key),
      display_label: entries[0]?.display_label ?? complianceLaneLabel(key),
      item_count: entries.length,
    })
  }

  const totalHeight = cursorY + 24 // bottom padding

  // ── Cycle detection (Tarjan-SCC) on `depends_on` edges ───────────
  const dependsEdges = snapshot.edges.filter((e) => e.kind === "depends_on")
  const cycleEdgeIds = findCycleEdges(dependsEdges)
  const cycleEdges = snapshot.edges.filter((e) => cycleEdgeIds.has(e.id))
  const layoutEdges = snapshot.edges.filter((e) => !cycleEdgeIds.has(e.id))

  // ── Lane assignment per node ─────────────────────────────────────
  const phaseIdSet = new Set(hints.phases_order)
  const sprintIdSet = new Set(hints.sprints_order)
  const epicIdSet = new Set(extension.epics.map((e) => e.id))
  const complianceByWorkItem = new Map<string, string>()
  for (const row of extension.compliance_lanes) {
    if (!complianceByWorkItem.has(row.work_item_id)) {
      complianceByWorkItem.set(row.work_item_id, row.lane_key)
    }
  }

  // ── Per-node badge counts ────────────────────────────────────────
  const riskByAnchor = new Map<string, number>()
  const decisionByAnchor = new Map<string, number>()
  const aiByAnchor = new Map<string, number>()
  for (const edge of layoutEdges) {
    if (edge.kind === "increases_risk") {
      bump(riskByAnchor, edge.target_node_id)
    } else if (edge.kind === "influences") {
      // Decision-Influences vs. AI-Recommendation-Influences differ
      // by source kind — but at edge-time we don't have source-kind.
      // Approximation: counted as decision; AI overrides if source
      // node is `recommendation` (handled below in node pass).
      bump(decisionByAnchor, edge.target_node_id)
    }
  }
  // Re-pass: decision vs recommendation distinction via source kind.
  const sourceKindById = new Map(snapshot.nodes.map((n) => [n.id, n.kind]))
  for (const edge of layoutEdges) {
    if (edge.kind !== "influences") continue
    if (sourceKindById.get(edge.source_node_id) === "recommendation") {
      // move the counted unit from decision → ai.
      const t = edge.target_node_id
      if ((decisionByAnchor.get(t) ?? 0) > 0) {
        decisionByAnchor.set(t, (decisionByAnchor.get(t) ?? 1) - 1)
        if (decisionByAnchor.get(t) === 0) decisionByAnchor.delete(t)
      }
      bump(aiByAnchor, t)
    }
  }

  // ── Node positioning ─────────────────────────────────────────────
  const positioned: PositionedNode[] = []

  // Project start node (synthetic, left-fixed).
  const startId = "trajectory:start"
  positioned.push({
    id: startId,
    source_id: startId,
    kind: "project_start",
    label: "Start",
    detail: null,
    x: LEFT_PAD,
    y: laneCenterFor(lanes, "phase") ?? laneCenterFor(lanes, "sprint") ?? totalHeight / 2,
    width: NODE_SIZE.project_start.w,
    height: NODE_SIZE.project_start.h,
    lane_id: lanes[0]?.id ?? "lane:phase",
    lane_kind: lanes[0]?.kind ?? "phase",
    is_critical: false,
    risk_count: 0,
    decision_count: 0,
    ai_recommendation_count: 0,
    attributes: {},
    href: null,
  })

  // Phases (in sequence order).
  const phaseLaneY = laneCenterFor(lanes, "phase")
  if (phaseLaneY != null) {
    let col = 1
    for (const phaseId of hints.phases_order) {
      const node = snapshot.nodes.find(
        (n) => n.kind === "phase" && n.id === `phase:${phaseId}`,
      )
      if (!node) continue
      positioned.push(
        buildPositionedFromSnapshot(node, {
          kind: "phase",
          x: LEFT_PAD + col * COL_STEP,
          y: phaseLaneY,
          lane_id: "lane:phase",
          lane_kind: "phase",
          riskByAnchor,
          decisionByAnchor,
          aiByAnchor,
        }),
      )
      col++
    }
  }

  // Milestones placed on phase lane.
  if (phaseLaneY != null) {
    let mCol = 0.5
    for (const node of snapshot.nodes) {
      if (node.kind !== "milestone") continue
      positioned.push(
        buildPositionedFromSnapshot(node, {
          kind: "milestone",
          x: LEFT_PAD + (1.5 + mCol) * COL_STEP,
          y: phaseLaneY + 36,
          lane_id: "lane:phase",
          lane_kind: "phase",
          riskByAnchor,
          decisionByAnchor,
          aiByAnchor,
        }),
      )
      mCol++
    }
  }

  // Sprints + Epic spans.
  const sprintLaneY = laneCenterFor(lanes, "sprint")
  const epicLaneY = laneCenterFor(lanes, "epic")
  const sprintColumn = new Map<string, number>()
  if (sprintLaneY != null) {
    let col = 1
    for (const sprint of extension.sprints) {
      sprintColumn.set(sprint.id, col)
      positioned.push({
        id: `sprint:${sprint.id}`,
        source_id: sprint.id,
        kind: "sprint",
        label: sprint.name,
        detail: sprint.state,
        x: LEFT_PAD + col * COL_STEP,
        y: sprintLaneY,
        width: NODE_SIZE.sprint.w,
        height: NODE_SIZE.sprint.h,
        lane_id: "lane:sprint",
        lane_kind: "sprint",
        is_critical: sprint.state === "active",
        risk_count: 0,
        decision_count: 0,
        ai_recommendation_count: 0,
        attributes: { state: sprint.state },
        href: null,
      })
      col++
    }
  }

  // Epic span-bars: width spans first to last sprint with stories.
  if (epicLaneY != null && sprintLaneY != null) {
    for (const epic of extension.epics) {
      const cols = epic.sprint_ids
        .map((sid) => sprintColumn.get(sid))
        .filter((c): c is number => c != null)
        .sort((a, b) => a - b)
      if (cols.length === 0) continue
      const firstCol = cols[0]
      const lastCol = cols[cols.length - 1]
      const x = LEFT_PAD + firstCol * COL_STEP - NODE_SIZE.sprint.w / 2
      const width = (lastCol - firstCol) * COL_STEP + NODE_SIZE.sprint.w
      positioned.push({
        id: `epic:${epic.id}`,
        source_id: epic.id,
        kind: "epic",
        label: epic.title,
        detail: epic.status,
        x,
        y: epicLaneY,
        width: Math.max(width, NODE_SIZE.epic.w),
        height: NODE_SIZE.epic.h,
        lane_id: "lane:epic",
        lane_kind: "epic",
        is_critical: false,
        risk_count: riskByAnchor.get(`work_item:${epic.id}`) ?? 0,
        decision_count: decisionByAnchor.get(`work_item:${epic.id}`) ?? 0,
        ai_recommendation_count:
          aiByAnchor.get(`work_item:${epic.id}`) ?? 0,
        attributes: { kind: "epic", status: epic.status },
        href: null,
      })
    }
  }

  // Work-items in sprint-lane (non-epic), placed at their sprint column.
  if (sprintLaneY != null) {
    const workItems = snapshot.nodes.filter(
      (n) =>
        n.kind === "work_item" &&
        (n.attributes.kind as string | undefined) !== "epic",
    )
    let stackPerCol = new Map<number, number>()
    for (const node of workItems) {
      const sprintNodeIdAttr = node.attributes.sprint_id as
        | string
        | undefined
      const col = sprintNodeIdAttr
        ? sprintColumn.get(sprintNodeIdAttr) ?? null
        : null
      if (col == null) continue
      const stackIdx = stackPerCol.get(col) ?? 0
      stackPerCol.set(col, stackIdx + 1)
      positioned.push(
        buildPositionedFromSnapshot(node, {
          kind: "work_item",
          x: LEFT_PAD + col * COL_STEP,
          y: sprintLaneY + 24 + stackIdx * 24,
          lane_id: "lane:sprint",
          lane_kind: "sprint",
          riskByAnchor,
          decisionByAnchor,
          aiByAnchor,
        }),
      )
    }
  }

  // Cost lane items.
  const costLaneY = laneCenterFor(lanes, "cost")
  if (costLaneY != null && extension.cost_lane_items.length > 0) {
    let col = 1
    for (const item of extension.cost_lane_items) {
      positioned.push({
        id: `budget:${item.id}`,
        source_id: item.id,
        kind: "budget",
        label: item.label,
        detail:
          item.amount_cents != null && item.currency
            ? `${(item.amount_cents / 100).toLocaleString("de-DE")} ${item.currency}`
            : null,
        x: LEFT_PAD + col * COL_STEP,
        y: costLaneY,
        width: NODE_SIZE.budget.w,
        height: NODE_SIZE.budget.h,
        lane_id: "lane:cost",
        lane_kind: "cost",
        is_critical: false,
        risk_count: 0,
        decision_count: 0,
        ai_recommendation_count: 0,
        attributes: { over_budget: item.over_budget },
        href: null,
      })
      col++
    }
  }

  // Compliance lane items.
  for (const lane of lanes) {
    if (lane.kind !== "compliance") continue
    const key = lane.id.replace("lane:compliance:", "")
    const wis = extension.compliance_lanes.filter((c) => c.lane_key === key)
    let col = 1
    for (const row of wis) {
      const node = snapshot.nodes.find(
        (n) => n.kind === "work_item" && n.id === `work_item:${row.work_item_id}`,
      )
      if (!node) continue
      positioned.push(
        buildPositionedFromSnapshot(node, {
          kind: "work_item",
          x: LEFT_PAD + col * COL_STEP,
          y: lane.y,
          lane_id: lane.id,
          lane_kind: "compliance",
          riskByAnchor,
          decisionByAnchor,
          aiByAnchor,
        }),
      )
      col++
    }
  }

  // Goals — F-PROJ-65-23 lock: max 3 top-level goals visible + `+N`
  // counter pentagon. Sub-goals (parent_goal_id != null) never render
  // as own pentagons — they live inside their parent's DetailPanel tree.
  const topLevelGoals = extension.goals.filter(
    (g) => g.parent_goal_id == null,
  )
  const visibleGoals = topLevelGoals.slice(0, 3)
  const overflowCount = topLevelGoals.length - visibleGoals.length
  const rightX = totalRightX(positioned, COL_STEP) + RIGHT_PAD
  for (let i = 0; i < visibleGoals.length; i++) {
    const goal = visibleGoals[i]
    const yBase = (lanes[0]?.y ?? totalHeight / 2) + i * (NODE_SIZE.goal.h + 12)
    positioned.push({
      id: `goal:${goal.id}`,
      source_id: goal.id,
      kind: "goal",
      label: goal.title,
      detail: goal.status,
      x: rightX,
      y: yBase,
      width: NODE_SIZE.goal.w,
      height: NODE_SIZE.goal.h,
      lane_id: lanes[0]?.id ?? "lane:phase",
      lane_kind: "goal",
      is_critical: goal.status === "active",
      risk_count: 0,
      decision_count: 0,
      ai_recommendation_count: 0,
      attributes: { status: goal.status },
      href: null,
    })
  }
  // Overflow counter pentagon: synthetic node `goal-overflow` with a
  // pseudo-id; FE renders it as a smaller dashed pentagon labelled "+N".
  if (overflowCount > 0) {
    const yBase =
      (lanes[0]?.y ?? totalHeight / 2) +
      visibleGoals.length * (NODE_SIZE.goal.h + 12)
    positioned.push({
      id: "goal-overflow",
      source_id: "goal-overflow",
      kind: "goal",
      label: `+${overflowCount}`,
      detail: `${overflowCount} weitere Ziele`,
      x: rightX,
      y: yBase,
      width: NODE_SIZE.goal.w,
      height: NODE_SIZE.goal.h - 8,
      lane_id: lanes[0]?.id ?? "lane:phase",
      lane_kind: "goal",
      is_critical: false,
      risk_count: 0,
      decision_count: 0,
      ai_recommendation_count: 0,
      attributes: {
        status: "overflow",
        overflow_count: overflowCount,
      },
      href: null,
    })
  }

  // ── Edge routing — keep only edges where both endpoints are
  //    in the positioned set. Critical edges = both endpoints critical.
  const positionedIdSet = new Set(positioned.map((n) => n.id))
  const positionedLaneById = new Map(
    positioned.map((n) => [n.id, n.lane_id] as const),
  )
  const routedEdges: RoutedEdge[] = []
  for (const edge of layoutEdges) {
    if (!positionedIdSet.has(edge.source_node_id)) continue
    if (!positionedIdSet.has(edge.target_node_id)) continue
    const aLane = positionedLaneById.get(edge.source_node_id)
    const bLane = positionedLaneById.get(edge.target_node_id)
    routedEdges.push({
      id: edge.id,
      source_node_id: edge.source_node_id,
      target_node_id: edge.target_node_id,
      kind: edge.kind,
      is_critical:
        (positioned.find((n) => n.id === edge.source_node_id)?.is_critical ??
          false) &&
        (positioned.find((n) => n.id === edge.target_node_id)?.is_critical ??
          false),
      inter_lane: aLane !== bLane,
    })
  }

  const width = Math.max(rightX + NODE_SIZE.goal.w + 32, 720)

  return {
    width,
    height: totalHeight,
    lanes,
    nodes: positioned,
    edges: routedEdges,
    cycle_edges: cycleEdges,
    cycle_count: countDistinctCycles(cycleEdges),
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function laneCenterFor(
  lanes: TrajectoryLane[],
  kind: TrajectoryLaneKind,
): number | null {
  return lanes.find((l) => l.kind === kind)?.y ?? null
}

function totalRightX(nodes: PositionedNode[], step: number): number {
  if (nodes.length === 0) return LEFT_PAD + step
  return Math.max(...nodes.map((n) => n.x + n.width / 2))
}

function buildPositionedFromSnapshot(
  node: GraphNode,
  ctx: {
    kind: TrajectoryNodeKind
    x: number
    y: number
    lane_id: string
    lane_kind: TrajectoryLaneKind
    riskByAnchor: Map<string, number>
    decisionByAnchor: Map<string, number>
    aiByAnchor: Map<string, number>
  },
): PositionedNode {
  const size = NODE_SIZE[ctx.kind]
  const critical =
    Boolean(node.attributes.is_critical) || node.tone === "warning"
  return {
    id: node.id,
    source_id: stripPrefix(node.id),
    kind: ctx.kind,
    label: node.label,
    detail: node.detail,
    x: ctx.x,
    y: ctx.y,
    width: size.w,
    height: size.h,
    lane_id: ctx.lane_id,
    lane_kind: ctx.lane_kind,
    is_critical: critical,
    risk_count: ctx.riskByAnchor.get(node.id) ?? 0,
    decision_count: ctx.decisionByAnchor.get(node.id) ?? 0,
    ai_recommendation_count: ctx.aiByAnchor.get(node.id) ?? 0,
    attributes: node.attributes,
    href: node.href,
  }
}

function stripPrefix(idWithKind: string): string {
  const colonIdx = idWithKind.indexOf(":")
  return colonIdx === -1 ? idWithKind : idWithKind.slice(colonIdx + 1)
}

function emptyLayout(): TrajectoryLayout {
  return {
    width: 720,
    height: 320,
    lanes: [],
    nodes: [],
    edges: [],
    cycle_edges: [],
    cycle_count: 0,
  }
}

function sortComplianceKeys(keys: string[], tenantOrder: string[]): string[] {
  const idxOf = (k: string) => {
    const i = tenantOrder.indexOf(k)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  return [...keys].sort((a, b) => {
    const ai = idxOf(a)
    const bi = idxOf(b)
    if (ai !== bi) return ai - bi
    return a.localeCompare(b)
  })
}

const COMPLIANCE_LABEL: Record<string, string> = {
  dsgvo: "DSGVO",
  iso27001: "ISO 27001",
  iso9001: "ISO 9001",
  vergabe: "Vergabe",
}
function complianceLaneLabel(key: string): string {
  return COMPLIANCE_LABEL[key] ?? key.toUpperCase()
}

const COMPLIANCE_ICON: Record<string, string> = {
  dsgvo: "shield",
  iso27001: "verified",
  iso9001: "verified",
  vergabe: "gavel",
}
function complianceLaneIcon(key: string): string {
  return COMPLIANCE_ICON[key] ?? "label"
}

/**
 * Tarjan-SCC on the `depends_on` edge subgraph.
 * Returns the set of edge ids that participate in any cycle.
 */
export function findCycleEdges(edges: GraphEdge[]): Set<string> {
  const adj = new Map<string, Array<{ to: string; edgeId: string }>>()
  for (const e of edges) {
    const list = adj.get(e.source_node_id) ?? []
    list.push({ to: e.target_node_id, edgeId: e.id })
    adj.set(e.source_node_id, list)
  }

  let index = 0
  const indices = new Map<string, number>()
  const lowlink = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const sccs: string[][] = []

  function strongConnect(v: string) {
    indices.set(v, index)
    lowlink.set(v, index)
    index++
    stack.push(v)
    onStack.add(v)
    for (const { to } of adj.get(v) ?? []) {
      if (!indices.has(to)) {
        strongConnect(to)
        lowlink.set(v, Math.min(lowlink.get(v) ?? 0, lowlink.get(to) ?? 0))
      } else if (onStack.has(to)) {
        lowlink.set(v, Math.min(lowlink.get(v) ?? 0, indices.get(to) ?? 0))
      }
    }
    if (lowlink.get(v) === indices.get(v)) {
      const scc: string[] = []
      let w: string | undefined
      do {
        w = stack.pop()
        if (w == null) break
        onStack.delete(w)
        scc.push(w)
      } while (w !== v)
      sccs.push(scc)
    }
  }

  for (const v of adj.keys()) {
    if (!indices.has(v)) strongConnect(v)
  }

  // Edges that participate in cycles: both endpoints in an SCC of size > 1,
  // OR a self-loop (SCC of size 1 with self-edge).
  const sccByNode = new Map<string, number>()
  sccs.forEach((scc, i) => {
    for (const n of scc) sccByNode.set(n, i)
  })
  const cycleEdgeIds = new Set<string>()
  for (const e of edges) {
    const aScc = sccByNode.get(e.source_node_id)
    const bScc = sccByNode.get(e.target_node_id)
    if (aScc == null || bScc == null) continue
    if (aScc !== bScc) continue
    const scc = sccs[aScc]
    if (scc.length > 1 || e.source_node_id === e.target_node_id) {
      cycleEdgeIds.add(e.id)
    }
  }
  return cycleEdgeIds
}

function countDistinctCycles(edges: GraphEdge[]): number {
  // Approximation: distinct strongly-connected components touched.
  const seen = new Set<string>()
  for (const e of edges) {
    seen.add(e.source_node_id)
    seen.add(e.target_node_id)
  }
  return seen.size === 0 ? 0 : Math.max(1, Math.floor(seen.size / 2))
}
