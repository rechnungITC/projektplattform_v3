"use client"

/**
 * PROJ-65 ε.1 — TrajectoryGraph2D.
 *
 * SVG-based renderer of the lane-layered project trajectory. Built on
 * top of the pure `layoutTrajectory` function: takes a positioned
 * layout and draws lanes (top→bottom), nodes, edges, and overlays
 * Risk/Decision/AI badges as HTML anchored to node positions.
 *
 * Visual treatment follows `docs/design/PROJ-65-epsilon1-frontend-brief.md`
 * (Knoten-Visuals table, Lane-Header table, Critical-Path-Overlay).
 */

import { motion, useReducedMotion } from "framer-motion"
import Link from "next/link"
import * as React from "react"

import { Button } from "@/components/ui/button"
import type {
  PositionedNode,
  TrajectoryLane,
  TrajectoryLayout,
} from "@/lib/project-graph/trajectory-layout"
import type { NodeAssignee } from "@/lib/project-graph/types"

import { StakeholderMarker } from "./stakeholder/stakeholder-marker"
import {
  AIRecommendationBadge,
  RiskDecisionBadgeGroup,
} from "./trajectory-badges"
import { PlanMutateDragHandle } from "./trajectory/plan-mutate-drag-handle"

interface TrajectoryGraph2DProps {
  layout: TrajectoryLayout
  focusedNodeId: string | null
  onFocusNode: (nodeId: string | null) => void
  onOpenRiskDecision: (nodeId: string, tab: "risks" | "decisions") => void
  onOpenAI: (nodeId: string) => void
  /** Project id used by the cost-lane empty-state CTA link. */
  projectId?: string
  /** True when current user has project-editor permission — controls
   *  whether the cost-lane empty-state shows the create CTA. */
  canEdit?: boolean
  /**
   * PROJ-65 ε.2 — assignees per work_item node. Used to render
   * stakeholder markers in the bottom-right slot of work-item nodes
   * (FE-1). Map key is the snapshot source id (e.g. `wi-uuid`); the
   * positioned node id is `work_item:wi-uuid`.
   */
  assigneesByWorkItem?: Map<string, NodeAssignee[]>
  onOpenStakeholders?: (
    workItemId: string,
    focusAssigneeId: string | null,
  ) => void
  /**
   * PROJ-65 ε.2 (F-PROJ-65-17) — positioned-node id (`work_item:<id>`)
   * receiving a transient dashed-amber receipt for ~3 s after a swap
   * Vorschau-übernehmen. null when no receipt active.
   */
  swapReceiptNodeId?: string | null
  /**
   * PROJ-65 ε.3b — true when the server emits
   * `snapshot.trajectory.permissions.can_plan_mutate === true`. Drives
   * visibility of the per-node `<PlanMutateDragHandle />`.
   */
  canPlanMutate?: boolean
  /**
   * PROJ-65 ε.3b — fired when a Sprint/Phase drag-handle is dropped or
   * the manual-date-input fallback submits. `days` is the snap-to-day
   * delta (positive = future). Parent opens the PlanMutateDialog.
   */
  onPlanMutateDrop?: (
    node: PositionedNode,
    days: number,
  ) => void
  /**
   * PROJ-65 ε.3b — day-axis scale (SVG px per day) used to convert
   * pointer-delta into a snap-to-day count. Falls back to a heuristic
   * derived from layout.width if not supplied.
   */
  pxPerDay?: number
  /**
   * PROJ-65 ε.3c.α.5 — idle-warmup trigger for the lazy-loaded Plan-Mutate
   * dialog chunk. Fired ~300ms after the pointer enters a sprint/phase node
   * (only when `showDragHandles` is true). Safe to no-op when unset.
   */
  onPreloadPlanMutateDialog?: () => void
}

const PRELOAD_HOVER_DELAY_MS = 300

const LANE_LABEL_WIDTH = 56

const NODE_TONE: Record<string, { fill: string; border: string }> = {
  project_start: { fill: "fill-sky-500", border: "stroke-sky-700" },
  phase: { fill: "fill-card", border: "stroke-border" },
  milestone: { fill: "fill-amber-400/30", border: "stroke-amber-500" },
  sprint: { fill: "fill-card", border: "stroke-border" },
  epic: { fill: "fill-card/60", border: "stroke-sky-500" },
  work_item: { fill: "fill-muted", border: "stroke-border" },
  goal: { fill: "fill-emerald-500/20", border: "stroke-emerald-600" },
  budget: { fill: "fill-card", border: "stroke-border" },
}

export function TrajectoryGraph2D({
  layout,
  focusedNodeId,
  onFocusNode,
  onOpenRiskDecision,
  onOpenAI,
  projectId,
  canEdit = true,
  assigneesByWorkItem,
  onOpenStakeholders,
  swapReceiptNodeId = null,
  canPlanMutate = false,
  onPlanMutateDrop,
  pxPerDay,
  onPreloadPlanMutateDialog,
}: TrajectoryGraph2DProps) {
  // Best-effort px/day derivation when not supplied: spread across the
  // visible content width assuming a 60-day window. Caller can pass an
  // exact value once it has a calibrated time-axis.
  const resolvedPxPerDay = pxPerDay ?? Math.max(2, (layout.width - 80) / 60)
  const showDragHandles = canPlanMutate && canEdit && Boolean(onPlanMutateDrop)
  const reducedMotion = useReducedMotion()
  const motionDuration = reducedMotion ? 0 : 0.2

  // PROJ-65 ε.3c.α.5 — 300ms-hover preload trigger on Sprint/Phase nodes.
  // Single timer at component scope; we always clear the previous timer
  // before scheduling a new one so the user can sweep over many nodes
  // without firing N imports (Webpack dedupes regardless, but clearing
  // is cleaner). Preload is fire-and-forget; never blocks rendering.
  const preloadTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const schedulePlanMutatePreload = React.useCallback(() => {
    if (!showDragHandles || !onPreloadPlanMutateDialog) return
    if (preloadTimerRef.current) clearTimeout(preloadTimerRef.current)
    preloadTimerRef.current = setTimeout(() => {
      onPreloadPlanMutateDialog()
      preloadTimerRef.current = null
    }, PRELOAD_HOVER_DELAY_MS)
  }, [showDragHandles, onPreloadPlanMutateDialog])
  const cancelPlanMutatePreload = React.useCallback(() => {
    if (preloadTimerRef.current) {
      clearTimeout(preloadTimerRef.current)
      preloadTimerRef.current = null
    }
  }, [])
  React.useEffect(() => {
    return () => {
      if (preloadTimerRef.current) clearTimeout(preloadTimerRef.current)
    }
  }, [])

  // Build a node lookup once.
  const nodeById = React.useMemo(() => {
    const m = new Map<string, PositionedNode>()
    for (const n of layout.nodes) m.set(n.id, n)
    return m
  }, [layout.nodes])

  if (layout.nodes.length === 0) {
    return null
  }

  return (
    <div
      className="relative overflow-x-auto overflow-y-hidden rounded-md border bg-card"
      data-testid="trajectory-graph-2d"
    >
      <div
        className="relative"
        style={{ width: layout.width, height: layout.height }}
      >
        {/* Lane headers (sticky-left) */}
        <div
          className="pointer-events-none absolute left-0 top-0 z-10"
          style={{ width: LANE_LABEL_WIDTH, height: layout.height }}
        >
          {layout.lanes.map((lane) => (
            <LaneHeader key={lane.id} lane={lane} />
          ))}
        </div>

        <svg
          role="img"
          aria-label="Projekttrajektorie"
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="absolute inset-0"
        >
          {/* Lane backgrounds */}
          {layout.lanes.map((lane) => (
            <rect
              key={`bg-${lane.id}`}
              x={LANE_LABEL_WIDTH}
              y={lane.y - lane.height / 2}
              width={layout.width - LANE_LABEL_WIDTH}
              height={lane.height}
              className={
                lane.kind === "phase" || lane.kind === "sprint"
                  ? "fill-muted/20"
                  : lane.kind === "epic"
                    ? "fill-sky-500/5"
                    : lane.kind === "cost"
                      ? "fill-emerald-500/5"
                      : "fill-amber-500/5"
              }
            />
          ))}

          {/* Lane separators */}
          {layout.lanes.map((lane) => (
            <line
              key={`sep-${lane.id}`}
              x1={LANE_LABEL_WIDTH}
              x2={layout.width}
              y1={lane.y + lane.height / 2}
              y2={lane.y + lane.height / 2}
              className="stroke-border"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
          ))}

          {/* Cost-lane empty-state — body text in SVG; CTA-Button overlay below */}
          {layout.lanes
            .filter((l) => l.cost_state === "empty")
            .map((lane) => (
              <text
                key={`empty-${lane.id}`}
                x={LANE_LABEL_WIDTH + 16}
                y={lane.y - 4}
                className="fill-muted-foreground text-xs"
              >
                Noch keine Budget-Posten im Pfad
              </text>
            ))}

          {/* Edges */}
          {layout.edges.map((edge) => {
            const a = nodeById.get(edge.source_node_id)
            const b = nodeById.get(edge.target_node_id)
            if (!a || !b) return null
            const isFocused =
              focusedNodeId != null &&
              (edge.source_node_id === focusedNodeId ||
                edge.target_node_id === focusedNodeId)
            return (
              <motion.line
                key={edge.id}
                x1={a.x + a.width / 2}
                y1={a.y}
                x2={b.x - b.width / 2}
                y2={b.y}
                className={
                  edge.is_critical
                    ? "stroke-sky-500"
                    : isOnGreenPath(a) && isOnGreenPath(b)
                      ? "stroke-emerald-500"
                      : isFocused
                        ? "stroke-foreground"
                        : "stroke-border"
                }
                initial={false}
                animate={{
                  strokeWidth: edge.is_critical
                    ? 2.5
                    : isOnGreenPath(a) && isOnGreenPath(b)
                      ? 1.5
                      : isFocused
                        ? 2
                        : 1,
                  opacity: 1,
                }}
                transition={{ duration: motionDuration }}
              />
            )
          })}

          {/* Nodes */}
          {layout.nodes.map((node) => {
            const tone = NODE_TONE[node.kind] ?? NODE_TONE.work_item
            const isFocus = focusedNodeId === node.id
            const isCircle =
              node.kind === "project_start" || node.kind === "milestone"
            const isDiamond = node.kind === "milestone"
            const isGoal = node.kind === "goal"

            const x = node.x - node.width / 2
            const y = node.y - node.height / 2

            return (
              <motion.g
                key={node.id}
                tabIndex={0}
                role="button"
                aria-label={`${nodeKindLabel(node.kind)}: ${node.label}${
                  node.is_critical ? " (kritischer Pfad)" : ""
                }${node.risk_count > 0 ? ` · ${node.risk_count} Risiko(s)` : ""}${
                  node.decision_count > 0
                    ? ` · ${node.decision_count} Entscheidung(en)`
                    : ""
                }`}
                onClick={() => onFocusNode(node.id)}
                onFocus={() => onFocusNode(node.id)}
                onPointerEnter={
                  node.kind === "sprint" || node.kind === "phase"
                    ? schedulePlanMutatePreload
                    : undefined
                }
                onPointerLeave={
                  node.kind === "sprint" || node.kind === "phase"
                    ? cancelPlanMutatePreload
                    : undefined
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onFocusNode(node.id)
                  }
                }}
                className="cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
                initial={
                  reducedMotion ? false : { opacity: 0, scale: 0.85 }
                }
                animate={{ opacity: 1, scale: 1 }}
                whileHover={reducedMotion ? undefined : { scale: 1.04 }}
                transition={{ duration: motionDuration }}
              >
                {isCircle ? (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.width / 2}
                    className={`${tone.fill} ${tone.border}`}
                    strokeWidth={isFocus ? 3 : 1.5}
                  />
                ) : isDiamond ? (
                  <polygon
                    points={`${node.x},${y} ${x + node.width},${node.y} ${node.x},${y + node.height} ${x},${node.y}`}
                    className={`${tone.fill} ${tone.border}`}
                    strokeWidth={isFocus ? 3 : 1.5}
                  />
                ) : isGoal ? (
                  (() => {
                    const status = goalStatusTone(node)
                    const goalFill =
                      status === "active"
                        ? "fill-emerald-500/20"
                        : status === "achieved"
                          ? "fill-emerald-500/10"
                          : status === "abandoned"
                            ? "fill-muted"
                            : "fill-muted/40"
                    const goalStroke =
                      status === "active"
                        ? "stroke-emerald-500"
                        : status === "achieved"
                          ? "stroke-emerald-400"
                          : "stroke-border"
                    return (
                      <polygon
                        points={`${x},${y} ${x + node.width - 12},${y} ${x + node.width},${node.y} ${x + node.width - 12},${y + node.height} ${x},${y + node.height}`}
                        className={`${goalFill} ${goalStroke}`}
                        strokeWidth={isFocus ? 3 : 2}
                        strokeDasharray={
                          status === "abandoned" ? "4 3" : undefined
                        }
                      />
                    )
                  })()
                ) : (
                  <rect
                    x={x}
                    y={y}
                    width={node.width}
                    height={node.height}
                    rx={6}
                    className={`${tone.fill} ${tone.border}`}
                    strokeWidth={isFocus ? 3 : 1.5}
                    strokeDasharray={node.kind === "epic" ? "4 3" : undefined}
                  />
                )}
                {isOnGreenPath(node) && !isGoal && (
                  <rect
                    x={x - 3}
                    y={y - 3}
                    width={node.width + 6}
                    height={node.height + 6}
                    rx={8}
                    className="fill-none stroke-emerald-400"
                    strokeWidth={1.5}
                    strokeOpacity={0.6}
                    style={{
                      filter: "drop-shadow(0 0 3px rgba(16, 185, 129, 0.45))",
                    }}
                  />
                )}
                {node.is_critical && (
                  <rect
                    x={x - 4}
                    y={y - 4}
                    width={node.width + 8}
                    height={node.height + 8}
                    rx={8}
                    className="fill-none stroke-sky-400"
                    strokeWidth={1.5}
                    strokeDasharray="3 2"
                  />
                )}
                {!isCircle && !isDiamond && (
                  <text
                    x={node.x}
                    y={node.y + 4}
                    textAnchor="middle"
                    className="pointer-events-none fill-foreground text-[10px] font-medium"
                  >
                    {truncate(node.label, node.kind === "epic" ? 24 : 12)}
                  </text>
                )}
                {showDragHandles &&
                  (node.kind === "sprint" || node.kind === "phase") && (
                    <PlanMutateDragHandle
                      anchorX={x + node.width}
                      anchorY={y}
                      pxPerDay={resolvedPxPerDay}
                      nodeLabel={node.label}
                      onDrop={(days) => onPlanMutateDrop?.(node, days)}
                      onManualShift={(days) =>
                        onPlanMutateDrop?.(node, days)
                      }
                    />
                  )}
              </motion.g>
            )
          })}
        </svg>

        {/* Badge overlays (HTML positioned absolutely on top of SVG nodes) */}
        {layout.nodes.map((node) => {
          if (
            node.risk_count === 0 &&
            node.decision_count === 0 &&
            node.ai_recommendation_count === 0
          ) {
            return null
          }
          return (
            <React.Fragment key={`badges-${node.id}`}>
              {(node.risk_count > 0 || node.decision_count > 0) && (
                <div
                  className="absolute"
                  style={{
                    left: node.x + node.width / 2 - 16,
                    top: node.y - node.height / 2 - 8,
                  }}
                >
                  <RiskDecisionBadgeGroup
                    riskCount={node.risk_count}
                    decisionCount={node.decision_count}
                    riskSeverity={
                      node.risk_count > 2
                        ? "high"
                        : node.risk_count > 0
                          ? "medium"
                          : null
                    }
                    onClickRisk={() => onOpenRiskDecision(node.id, "risks")}
                    onClickDecision={() =>
                      onOpenRiskDecision(node.id, "decisions")
                    }
                  />
                </div>
              )}
              {node.ai_recommendation_count > 0 && (
                <div
                  className="absolute"
                  style={{
                    left: node.x + node.width / 2 - 14,
                    top: node.y + node.height / 2 - 6,
                  }}
                >
                  <AIRecommendationBadge
                    count={node.ai_recommendation_count}
                    reducedMotion={reducedMotion ?? false}
                    onClick={() => onOpenAI(node.id)}
                  />
                </div>
              )}
            </React.Fragment>
          )
        })}

        {/* PROJ-65 ε.2 — StakeholderMarker overlay (bottom-right slot
            of work_item nodes). Only renders when assignees are available
            and the node is a work_item (not phase/sprint/goal). */}
        {assigneesByWorkItem &&
          layout.nodes
            .filter((n) => n.kind === "work_item")
            .map((node) => {
              const assignees =
                assigneesByWorkItem.get(node.source_id) ?? []
              if (assignees.length === 0) return null
              return (
                <div
                  key={`marker-${node.id}`}
                  className="absolute"
                  style={{
                    left: node.x + node.width / 2 - 8,
                    top: node.y + node.height / 2 - 10,
                  }}
                  data-testid="stakeholder-marker-anchor"
                >
                  <StakeholderMarker
                    assignees={assignees}
                    maxVisible={3}
                    onClickAssignee={(a) =>
                      onOpenStakeholders?.(node.source_id, a.resource_id)
                    }
                    onClickOverflow={() =>
                      onOpenStakeholders?.(node.source_id, null)
                    }
                    showReceipt={swapReceiptNodeId === node.id}
                  />
                </div>
              )
            })}

        {/* Cost-lane empty-state CTA (HTML overlay so it can be a real button) */}
        {projectId &&
          layout.lanes
            .filter((l) => l.cost_state === "empty")
            .map((lane) => (
              <div
                key={`empty-cta-${lane.id}`}
                className="absolute"
                style={{
                  left: LANE_LABEL_WIDTH + 16,
                  top: lane.y + 4,
                }}
                data-testid="cost-lane-empty-cta"
              >
                {canEdit ? (
                  <Button asChild size="sm" variant="outline" className="h-7">
                    <Link
                      href={`/projects/${encodeURIComponent(projectId)}/budget`}
                    >
                      + Budget-Posten anlegen
                    </Link>
                  </Button>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    Frage Projektleitung nach Budget-Anlage.
                  </span>
                )}
              </div>
            ))}
      </div>
    </div>
  )
}

const LANE_ICON_BG: Record<TrajectoryLane["kind"], string> = {
  phase: "bg-muted text-foreground",
  epic: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  sprint: "bg-muted text-foreground",
  cost: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  compliance: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  // `goal` is a positioning hint on PositionedNode.lane_kind, not a
  // rendered lane — value unused but the record completeness keeps
  // typing safe.
  goal: "",
}

function LaneHeader({ lane }: { lane: TrajectoryLane }) {
  return (
    <div
      className={`pointer-events-auto absolute flex w-full flex-col items-center justify-center gap-1 border-r border-border px-1 text-center ${LANE_ICON_BG[lane.kind]}`}
      style={{
        top: lane.y - lane.height / 2,
        height: lane.height,
      }}
      title={lane.display_label ?? lane.label}
    >
      <span
        className="material-symbols-outlined text-base leading-none"
        aria-hidden
      >
        {lane.icon}
      </span>
      <span className="line-clamp-1 text-[9px] font-semibold uppercase tracking-wide">
        {lane.label}
      </span>
      {lane.item_count > 0 && (
        <span className="text-[9px] text-muted-foreground">
          {lane.item_count}
        </span>
      )}
    </div>
  )
}

function isOnGreenPath(node: PositionedNode): boolean {
  return Boolean(
    (node.attributes as { is_on_green_path?: boolean }).is_on_green_path,
  )
}

function goalStatusTone(node: PositionedNode): "active" | "draft" | "achieved" | "abandoned" {
  const status = (node.attributes as { status?: string }).status
  if (status === "achieved" || status === "abandoned" || status === "active") return status
  return "draft"
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

function nodeKindLabel(kind: PositionedNode["kind"]): string {
  switch (kind) {
    case "project_start":
      return "Start"
    case "phase":
      return "Phase"
    case "milestone":
      return "Meilenstein"
    case "epic":
      return "Epic"
    case "sprint":
      return "Sprint"
    case "work_item":
      return "Work Item"
    case "goal":
      return "Ziel"
    case "budget":
      return "Budget"
    default:
      return String(kind)
  }
}
