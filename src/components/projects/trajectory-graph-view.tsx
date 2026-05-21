"use client"

/**
 * PROJ-65 ε.1 — TrajectoryGraphView.
 *
 * Owns the trajectory-snapshot fetch (`?include=trajectory`), the
 * 2D/3D toggle, focus state, AI-drawer state, and renders one of:
 *   - TrajectoryGraph2D (synchronous SVG)
 *   - TrajectoryGraph3D (dynamic-import; reuses PROJ-58 3D scene)
 *
 * Wraps the canvas with the standard Card + Toolbar layout used by
 * `ProjectGraphView`. Cycle banner + empty/loading/error states are
 * rendered above the canvas.
 */

import dynamic from "next/dynamic"
import { Box, Loader2, Network, Route as RouteIcon } from "lucide-react"
import { useReducedMotion } from "framer-motion"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  layoutTrajectory,
  type TrajectoryLayout,
} from "@/lib/project-graph/trajectory-layout"
import type {
  NodeAssignee,
  ProjectGraphSnapshot,
} from "@/lib/project-graph/types"
import { toast } from "sonner"

import { AIProposalDrawerPlaceholder } from "./ai-proposal-drawer-placeholder"
import { StakeholderDetailPanel } from "./stakeholder/stakeholder-detail-panel"
import {
  StakeholderSwapDialog,
  type SwapCandidate,
} from "./stakeholder/stakeholder-swap-dialog"
import { TrajectoryGraph2D } from "./trajectory-graph-2d"
import { CycleBanner } from "./trajectory-cycle-banner"

const TrajectoryGraph3D = dynamic(
  () =>
    import("@/components/projects/trajectory-graph-3d").then(
      (m) => m.TrajectoryGraph3D,
    ),
  {
    ssr: false,
    loading: () => <CanvasLoading label="3D-Trajektorie wird geladen ..." />,
  },
)

interface TrajectoryGraphViewProps {
  projectId: string
}

type Dimension = "2d" | "3d"

function hasWebGL2(): boolean {
  if (typeof document === "undefined") return false
  try {
    const canvas = document.createElement("canvas")
    return Boolean(canvas.getContext("webgl2"))
  } catch {
    return false
  }
}

export function TrajectoryGraphView({ projectId }: TrajectoryGraphViewProps) {
  const [snapshot, setSnapshot] =
    React.useState<ProjectGraphSnapshot | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [dimension, setDimension] = React.useState<Dimension>("2d")
  const [focusedNodeId, setFocusedNodeId] = React.useState<string | null>(null)
  const [focusedTab, setFocusedTab] = React.useState<
    "risks" | "decisions" | null
  >(null)
  const [aiDrawer, setAiDrawer] = React.useState<{
    nodeId: string
    count: number
  } | null>(null)
  const [stakeholderPanel, setStakeholderPanel] = React.useState<{
    workItemId: string
    focusAssigneeId: string | null
  } | null>(null)
  const [stakeholderSwap, setStakeholderSwap] = React.useState<{
    workItemId: string
    currentAssignee: NodeAssignee | null
  } | null>(null)
  const [swapReceiptNodeId, setSwapReceiptNodeId] = React.useState<string | null>(
    null,
  )
  const [webglAvailable, setWebglAvailable] = React.useState<boolean | null>(
    null,
  )
  const prefersReducedMotion = useReducedMotion()

  React.useEffect(() => {
    setWebglAvailable(hasWebGL2())
  }, [])

  React.useEffect(() => {
    if (prefersReducedMotion || webglAvailable === false) {
      setDimension("2d")
    }
  }, [prefersReducedMotion, webglAvailable])

  React.useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    fetch(
      `/api/projects/${encodeURIComponent(projectId)}/graph?include=trajectory`,
      { cache: "no-store" },
    )
      .then(async (res) => {
        if (!res.ok) {
          let msg = `HTTP ${res.status}`
          try {
            const body = (await res.json()) as {
              error?: { message?: string }
            }
            msg = body.error?.message ?? msg
          } catch {
            /* ignore */
          }
          throw new Error(msg)
        }
        return (await res.json()) as { graph: ProjectGraphSnapshot }
      })
      .then((body) => {
        if (!cancelled) setSnapshot(body.graph)
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const layout: TrajectoryLayout = React.useMemo(() => {
    if (!snapshot) {
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
    return layoutTrajectory(snapshot)
  }, [snapshot])

  const aiDrawerRecommendation = React.useMemo(() => {
    if (!aiDrawer || !snapshot) return null
    // Best-effort: first `recommendation` source that influences the
    // anchor — gives the user immediate context (F1 from designer brief).
    const inboundRec = snapshot.edges.find(
      (e) =>
        e.target_node_id === aiDrawer.nodeId &&
        e.kind === "influences" &&
        snapshot.nodes.find((n) => n.id === e.source_node_id)?.kind ===
          "recommendation",
    )
    if (!inboundRec) return null
    return (
      snapshot.nodes.find((n) => n.id === inboundRec.source_node_id)?.label ??
      null
    )
  }, [aiDrawer, snapshot])

  const focusedPositioned = React.useMemo(() => {
    if (!focusedNodeId) return null
    return layout.nodes.find((n) => n.id === focusedNodeId) ?? null
  }, [focusedNodeId, layout])

  const assigneesByWorkItem = React.useMemo(() => {
    const map = new Map<string, NodeAssignee[]>()
    if (!snapshot?.trajectory) return map
    for (const a of snapshot.trajectory.node_assignees) {
      const list = map.get(a.work_item_id) ?? []
      list.push(a)
      map.set(a.work_item_id, list)
    }
    return map
  }, [snapshot])

  const panelAssignees = stakeholderPanel
    ? assigneesByWorkItem.get(stakeholderPanel.workItemId) ?? []
    : []
  const panelNodeLabel = stakeholderPanel
    ? layout.nodes.find((n) => n.source_id === stakeholderPanel.workItemId)
        ?.label ?? "Knoten"
    : ""

  const canUse3D = webglAvailable !== false && !prefersReducedMotion
  const use3D = dimension === "3d" && canUse3D
  const method = layout.lanes.length === 0 ? null : "active"
  const hasContent = layout.nodes.length > 1 // start node always present

  return (
    <Card data-testid="trajectory-graph-view">
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-2">
            <RouteIcon className="h-4 w-4 text-sky-500" aria-hidden />
            <CardTitle className="text-base">Projekttrajektorie</CardTitle>
            {snapshot?.trajectory?.layout_hints.hybrid && (
              <Badge variant="outline" className="text-[10px]">
                Hybrid
              </Badge>
            )}
            {snapshot?.trajectory?.layout_hints.method && (
              <Badge variant="outline" className="text-[10px]">
                {snapshot.trajectory.layout_hints.method}
              </Badge>
            )}
          </div>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={dimension}
            onValueChange={(value) => {
              if (value === "2d" || value === "3d") setDimension(value)
            }}
            aria-label="Trajektorien-Dimension"
          >
            <ToggleGroupItem value="2d" aria-label="2D">
              <Network className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              2D
            </ToggleGroupItem>
            <ToggleGroupItem value="3d" aria-label="3D" disabled={!canUse3D}>
              <Box className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              3D
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Trajektorie wird geladen ...
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
          >
            Trajektorie fehlgeschlagen: {error}
          </p>
        )}
        {!isLoading && !error && snapshot && !hasContent && (
          <EmptyState
            projectId={projectId}
            method={snapshot.trajectory?.layout_hints.method ?? null}
          />
        )}
        {!isLoading && !error && snapshot && hasContent && (
          <>
            <CycleBanner
              cycleCount={layout.cycle_count}
              projectId={projectId}
            />
            {use3D ? (
              <TrajectoryGraph3D
                snapshot={snapshot}
                focusedNodeId={focusedNodeId}
                onFocusNode={setFocusedNodeId}
              />
            ) : (
              <TrajectoryGraph2D
                layout={layout}
                focusedNodeId={focusedNodeId}
                onFocusNode={(nodeId) => {
                  setFocusedNodeId(nodeId)
                  setFocusedTab(null)
                }}
                onOpenRiskDecision={(nodeId, tab) => {
                  setFocusedNodeId(nodeId)
                  setFocusedTab(tab)
                }}
                onOpenAI={(nodeId) => {
                  const node = layout.nodes.find((n) => n.id === nodeId)
                  setAiDrawer({
                    nodeId,
                    count: node?.ai_recommendation_count ?? 1,
                  })
                }}
                projectId={projectId}
                assigneesByWorkItem={assigneesByWorkItem}
                onOpenStakeholders={(workItemId, focusAssigneeId) =>
                  setStakeholderPanel({ workItemId, focusAssigneeId })
                }
              />
            )}
            {focusedPositioned &&
              (focusedPositioned.risk_count > 0 ||
                focusedPositioned.decision_count > 0 ||
                focusedPositioned.ai_recommendation_count > 0) && (
                <FocusSummary
                  node={focusedPositioned}
                  activeTab={focusedTab}
                  onOpenAI={() =>
                    setAiDrawer({
                      nodeId: focusedPositioned.id,
                      count: focusedPositioned.ai_recommendation_count,
                    })
                  }
                />
              )}
            {/* method/lanes summary footer */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>
                {layout.nodes.length} Knoten · {layout.edges.length} Kanten ·{" "}
                {layout.lanes.length} Lanes
              </span>
              {method == null && <span>· keine Methode gesetzt</span>}
            </div>
          </>
        )}
      </CardContent>
      <AIProposalDrawerPlaceholder
        open={aiDrawer != null}
        onOpenChange={(open) => {
          if (!open) setAiDrawer(null)
        }}
        recommendationTitle={aiDrawerRecommendation}
        recommendationCount={aiDrawer?.count ?? 0}
      />

      {/* PROJ-65 ε.2 — Stakeholder detail panel + swap dialog */}
      <StakeholderDetailPanel
        open={stakeholderPanel != null}
        onOpenChange={(open) => {
          if (!open) setStakeholderPanel(null)
        }}
        nodeLabel={panelNodeLabel}
        nodeSubtitle={null}
        assignees={panelAssignees}
        costClearView={snapshot?.trajectory?.cost_clear_view ?? false}
        projectId={projectId}
        onRequestSwap={() => {
          if (!stakeholderPanel) return
          const current =
            stakeholderPanel.focusAssigneeId != null
              ? panelAssignees.find(
                  (a) => a.resource_id === stakeholderPanel.focusAssigneeId,
                ) ?? null
              : panelAssignees[0] ?? null
          setStakeholderSwap({
            workItemId: stakeholderPanel.workItemId,
            currentAssignee: current,
          })
        }}
        focusAssigneeId={stakeholderPanel?.focusAssigneeId ?? null}
      />
      {stakeholderSwap && (
        <StakeholderSwapDialog
          open
          onOpenChange={(open) => {
            if (!open) setStakeholderSwap(null)
          }}
          projectId={projectId}
          workItemId={stakeholderSwap.workItemId}
          currentAssignee={stakeholderSwap.currentAssignee}
          costClearView={snapshot?.trajectory?.cost_clear_view ?? false}
          onConfirmTransient={(candidate: SwapCandidate) => {
            toast.success(
              "Stakeholder-Wechsel gespeichert (transient — Übernahme folgt in ε.3)",
              {
                description: `${candidate.name}${candidate.role ? ` · ${candidate.role}` : ""}`,
              },
            )
            // 3-second visual receipt on the marker stack.
            const nodeId = `work_item:${stakeholderSwap.workItemId}`
            setSwapReceiptNodeId(nodeId)
            window.setTimeout(() => setSwapReceiptNodeId(null), 3000)
            setStakeholderSwap(null)
          }}
        />
      )}
    </Card>
  )
}

function CanvasLoading({ label }: { label: string }) {
  return (
    <div className="flex h-[420px] items-center justify-center rounded-md border bg-muted/20 text-sm text-muted-foreground md:h-[520px]">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
      {label}
    </div>
  )
}

/**
 * PROJ-65 ε.1 — minimal focus summary for a selected node.
 * Shows risk/decision/AI counts inline with a tab-highlight when the
 * user landed here via a badge click. Full NodeDetailPanel ships in
 * ε.2 alongside Stakeholder-Marker.
 */
function FocusSummary({
  node,
  activeTab,
  onOpenAI,
}: {
  node: import("@/lib/project-graph/trajectory-layout").PositionedNode
  activeTab: "risks" | "decisions" | null
  onOpenAI: () => void
}) {
  return (
    <div
      data-testid="trajectory-focus-summary"
      className="rounded-md border bg-card px-3 py-2 text-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Fokus
          </p>
          <p className="truncate font-medium">{node.label}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {node.risk_count > 0 && (
            <span
              data-testid="focus-risk-pill"
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                activeTab === "risks"
                  ? "border-red-400 bg-red-500/15 text-red-700 dark:text-red-300"
                  : "border-border bg-muted text-muted-foreground"
              }`}
            >
              {node.risk_count} Risiko{node.risk_count === 1 ? "" : "s"}
            </span>
          )}
          {node.decision_count > 0 && (
            <span
              data-testid="focus-decision-pill"
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                activeTab === "decisions"
                  ? "border-sky-400 bg-sky-500/15 text-sky-700 dark:text-sky-300"
                  : "border-border bg-muted text-muted-foreground"
              }`}
            >
              {node.decision_count} Entscheidung
              {node.decision_count === 1 ? "" : "en"}
            </span>
          )}
          {node.ai_recommendation_count > 0 && (
            <button
              type="button"
              onClick={onOpenAI}
              data-testid="focus-ai-pill"
              className="rounded-full border border-violet-400 bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-700 hover:bg-violet-500/25 dark:text-violet-300"
            >
              {node.ai_recommendation_count} KI-Vorschlag
              {node.ai_recommendation_count === 1 ? "" : "e"}
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Detail-Panel mit Tabs und Aktionen folgt in ε.2.
      </p>
    </div>
  )
}

function EmptyState({
  projectId,
  method,
}: {
  projectId: string
  method: string | null
}) {
  const isWaterfall = method?.startsWith("waterfall") ?? false
  const isScrum =
    method === "scrum" || method === "safe" || method?.startsWith("hybrid")
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-muted/10 px-6 py-12 text-center"
      data-testid="trajectory-empty-state"
    >
      <RouteIcon className="h-10 w-10 text-muted-foreground" aria-hidden />
      <div>
        <p className="text-base font-medium">Noch keine Trajektorie</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Füge Phasen, Sprints oder Work-Items hinzu, um den Projektpfad zu
          sehen.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        {(isWaterfall || method == null) && (
          <Button asChild size="sm">
            <a
              href={`/projects/${encodeURIComponent(projectId)}/phasen`}
              data-testid="empty-cta-phase"
            >
              Phase anlegen
            </a>
          </Button>
        )}
        {isScrum && (
          <Button asChild size="sm">
            <a
              href={`/projects/${encodeURIComponent(projectId)}/sprints`}
              data-testid="empty-cta-sprint"
            >
              Sprint anlegen
            </a>
          </Button>
        )}
        <Button asChild size="sm" variant="outline">
          <a href={`/projects/${encodeURIComponent(projectId)}/backlog`}>
            Backlog öffnen
          </a>
        </Button>
      </div>
    </div>
  )
}
