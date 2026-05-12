"use client"

import dynamic from "next/dynamic"
import { motion, useReducedMotion } from "framer-motion"
import {
  Box,
  ExternalLink,
  GitBranch,
  Loader2,
  Network,
  RotateCcw,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  filterProjectGraphSnapshot,
  GRAPH_EDGE_KIND_LABEL,
  GRAPH_NODE_KIND_LABEL,
  GRAPH_TONE_COLOR,
  isCriticalNode,
  type Graph3DEdgeFilter,
  type Graph3DFilterPreset,
} from "@/lib/project-graph/three-adapter"
import type {
  GraphEdge,
  GraphNode,
  ProjectGraphSnapshot,
} from "@/lib/project-graph/types"

interface ProjectGraphViewProps {
  projectId: string
}

type ViewMode = "3d" | "2d"

const ProjectGraph3DCanvas = dynamic(
  () =>
    import("@/components/projects/project-graph-3d-canvas").then(
      (mod) => mod.ProjectGraph3DCanvas,
    ),
  {
    ssr: false,
    loading: () => <GraphCanvasLoading />,
  },
)

/**
 * PROJ-58-θ — 3D-first project graph.
 *
 * The existing SVG renderer remains as the robust 2D fallback. The 3D path is
 * route-local via next/dynamic and consumes the same read-only graph snapshot.
 */
export function ProjectGraphView({ projectId }: ProjectGraphViewProps) {
  const [snapshot, setSnapshot] =
    React.useState<ProjectGraphSnapshot | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadTick, setReloadTick] = React.useState(0)
  const [viewMode, setViewMode] = React.useState<ViewMode>("3d")
  const [filterPreset, setFilterPreset] =
    React.useState<Graph3DFilterPreset>("all")
  const [edgeFilter, setEdgeFilter] = React.useState<Graph3DEdgeFilter>("all")
  const [criticalOverlay, setCriticalOverlay] = React.useState(false)
  const [focusedNodeId, setFocusedNodeId] = React.useState<string | null>(null)
  const [focusedEdgeId, setFocusedEdgeId] = React.useState<string | null>(null)
  const [cameraResetTick, setCameraResetTick] = React.useState(0)
  const [webglAvailable, setWebglAvailable] = React.useState<boolean | null>(
    null,
  )

  const prefersReducedMotion = useReducedMotion()

  React.useEffect(() => {
    setWebglAvailable(hasWebGL2())
  }, [])

  React.useEffect(() => {
    if (prefersReducedMotion || webglAvailable === false) {
      setViewMode("2d")
    }
  }, [prefersReducedMotion, webglAvailable])

  React.useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    fetch(`/api/projects/${encodeURIComponent(projectId)}/graph`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          let msg = `HTTP ${res.status}`
          try {
            const body = (await res.json()) as { error?: { message?: string } }
            msg = body.error?.message ?? msg
          } catch {
            // ignore non-json errors
          }
          throw new Error(msg)
        }
        return (await res.json()) as { graph: ProjectGraphSnapshot }
      })
      .then((body) => {
        if (!cancelled) setSnapshot(body.graph)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, reloadTick])

  const visibleSnapshot = React.useMemo(() => {
    if (!snapshot) return null
    return filterProjectGraphSnapshot(snapshot, {
      preset: filterPreset,
      edgeFilter,
    })
  }, [edgeFilter, filterPreset, snapshot])

  React.useEffect(() => {
    if (!visibleSnapshot) return
    if (
      focusedNodeId &&
      !visibleSnapshot.nodes.some((node) => node.id === focusedNodeId)
    ) {
      setFocusedNodeId(null)
    }
    if (
      focusedEdgeId &&
      !visibleSnapshot.edges.some((edge) => edge.id === focusedEdgeId)
    ) {
      setFocusedEdgeId(null)
    }
  }, [focusedEdgeId, focusedNodeId, visibleSnapshot])

  const focusedNode =
    focusedNodeId && visibleSnapshot
      ? visibleSnapshot.nodes.find((node) => node.id === focusedNodeId) ?? null
      : null
  const focusedEdge =
    focusedEdgeId && visibleSnapshot
      ? visibleSnapshot.edges.find((edge) => edge.id === focusedEdgeId) ?? null
      : null
  const criticalCount = visibleSnapshot
    ? visibleSnapshot.nodes.filter(isCriticalNode).length
    : 0
  const use3D =
    viewMode === "3d" && webglAvailable !== false && !prefersReducedMotion

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="text-base">Projekt-Graph</CardTitle>
            {visibleSnapshot && (
              <p className="mt-1 text-xs text-muted-foreground">
                {visibleSnapshot.counts.nodes} Knoten ·{" "}
                {visibleSnapshot.counts.edges} Kanten sichtbar
              </p>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setReloadTick((t) => t + 1)}
            disabled={isLoading}
          >
            <RotateCcw
              className={`mr-2 h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
              aria-hidden
            />
            Neu laden
          </Button>
        </div>
        <GraphToolbar
          viewMode={viewMode}
          setViewMode={setViewMode}
          filterPreset={filterPreset}
          setFilterPreset={setFilterPreset}
          edgeFilter={edgeFilter}
          setEdgeFilter={setEdgeFilter}
          criticalOverlay={criticalOverlay}
          setCriticalOverlay={setCriticalOverlay}
          criticalCount={criticalCount}
          canUse3D={webglAvailable !== false && !prefersReducedMotion}
          onResetCamera={() => setCameraResetTick((tick) => tick + 1)}
          resetDisabled={!use3D}
        />
      </CardHeader>
      <CardContent>
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Graph wird
            geladen ...
          </p>
        )}
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            Graph fehlgeschlagen: {error}
          </p>
        )}
        {visibleSnapshot && visibleSnapshot.nodes.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Noch keine Inhalte im Projekt, die graphisch dargestellt werden
            koennen.
          </p>
        )}
        {visibleSnapshot && visibleSnapshot.nodes.length > 0 && (
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-3">
              {use3D ? (
                <ProjectGraph3DCanvas
                  snapshot={visibleSnapshot}
                  criticalOverlay={criticalOverlay}
                  focusedNodeId={focusedNodeId}
                  focusedEdgeId={focusedEdgeId}
                  resetTick={cameraResetTick}
                  onFocusNode={(nodeId) => {
                    setFocusedNodeId(nodeId)
                    setFocusedEdgeId(null)
                  }}
                  onFocusEdge={(edgeId) => {
                    setFocusedEdgeId(edgeId)
                    setFocusedNodeId(null)
                  }}
                />
              ) : (
                <Graph2DFallback
                  snapshot={visibleSnapshot}
                  focusedNodeId={focusedNodeId}
                  focusedEdgeId={focusedEdgeId}
                  criticalOverlay={criticalOverlay}
                  onFocusNode={(nodeId) => {
                    setFocusedNodeId(nodeId)
                    setFocusedEdgeId(null)
                  }}
                  onFocusEdge={(edgeId) => {
                    setFocusedEdgeId(edgeId)
                    setFocusedNodeId(null)
                  }}
                />
              )}
              <CountsLegend snapshot={visibleSnapshot} />
            </div>
            <GraphDetailPanel
              projectId={projectId}
              snapshot={visibleSnapshot}
              node={focusedNode}
              edge={focusedEdge}
              onEdgeDeleted={() => {
                setFocusedEdgeId(null)
                setReloadTick((t) => t + 1)
              }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function GraphToolbar({
  viewMode,
  setViewMode,
  filterPreset,
  setFilterPreset,
  edgeFilter,
  setEdgeFilter,
  criticalOverlay,
  setCriticalOverlay,
  criticalCount,
  canUse3D,
  onResetCamera,
  resetDisabled,
}: {
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  filterPreset: Graph3DFilterPreset
  setFilterPreset: (preset: Graph3DFilterPreset) => void
  edgeFilter: Graph3DEdgeFilter
  setEdgeFilter: (filter: Graph3DEdgeFilter) => void
  criticalOverlay: boolean
  setCriticalOverlay: (value: boolean) => void
  criticalCount: number
  canUse3D: boolean
  onResetCamera: () => void
  resetDisabled: boolean
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-2 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={viewMode}
          onValueChange={(value) => {
            if (value === "3d" || value === "2d") setViewMode(value)
          }}
          aria-label="Graph-Ansicht"
        >
          <ToggleGroupItem value="3d" aria-label="3D" disabled={!canUse3D}>
            <Box className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            3D
          </ToggleGroupItem>
          <ToggleGroupItem value="2d" aria-label="2D">
            <Network className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            2D
          </ToggleGroupItem>
        </ToggleGroup>
        <Button
          type="button"
          size="sm"
          variant={criticalOverlay ? "default" : "outline"}
          onClick={() => setCriticalOverlay(!criticalOverlay)}
          disabled={criticalCount === 0}
        >
          <GitBranch className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Kritisch{criticalCount > 0 ? ` (${criticalCount})` : ""}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onResetCamera}
          disabled={resetDisabled}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Reset
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:w-[420px]">
        <Select
          value={filterPreset}
          onValueChange={(value) =>
            setFilterPreset(value as Graph3DFilterPreset)
          }
        >
          <SelectTrigger className="h-9" aria-label="Graph-Sicht">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Sichten</SelectItem>
            <SelectItem value="delivery">Delivery</SelectItem>
            <SelectItem value="risk">Risiko</SelectItem>
            <SelectItem value="stakeholder">Stakeholder</SelectItem>
            <SelectItem value="budget">Budget</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={edgeFilter}
          onValueChange={(value) => setEdgeFilter(value as Graph3DEdgeFilter)}
        >
          <SelectTrigger className="h-9" aria-label="Kantenfilter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Kanten</SelectItem>
            <SelectItem value="dependencies">Abhaengigkeiten</SelectItem>
            <SelectItem value="blockers">Blocker</SelectItem>
            <SelectItem value="impact">Auswirkungen</SelectItem>
            <SelectItem value="stakeholder">Stakeholder</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

interface Position {
  x: number
  y: number
}

const RING_ORDER: GraphNode["kind"][] = [
  "phase",
  "milestone",
  "work_item",
  "stakeholder",
  "risk",
  "decision",
  "budget",
  "recommendation",
]

function Graph2DFallback({
  snapshot,
  focusedNodeId,
  focusedEdgeId,
  criticalOverlay,
  onFocusNode,
  onFocusEdge,
}: {
  snapshot: ProjectGraphSnapshot
  focusedNodeId: string | null
  focusedEdgeId: string | null
  criticalOverlay: boolean
  onFocusNode: (nodeId: string) => void
  onFocusEdge: (edgeId: string) => void
}) {
  const positions = React.useMemo(
    () => computePositions(snapshot.nodes),
    [snapshot.nodes],
  )
  const width = 720
  const height = 540
  const prefersReducedMotion = useReducedMotion()
  const motionDuration = prefersReducedMotion ? 0 : 0.18

  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Projekt-Graph 2D"
        className="h-[420px] w-full md:h-[560px]"
      >
        {snapshot.edges.map((edge) => {
          const a = positions.get(edge.source_node_id)
          const b = positions.get(edge.target_node_id)
          if (!a || !b) return null
          const sourceNode = snapshot.nodes.find(
            (node) => node.id === edge.source_node_id,
          )
          const targetNode = snapshot.nodes.find(
            (node) => node.id === edge.target_node_id,
          )
          const edgeOnCritical =
            sourceNode != null &&
            targetNode != null &&
            isCriticalNode(sourceNode) &&
            isCriticalNode(targetNode)
          const opacity = criticalOverlay && !edgeOnCritical ? 0.15 : 1
          const isFocused = focusedEdgeId === edge.id
          return (
            <motion.line
              key={edge.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={
                isFocused
                  ? "#0f172a"
                  : edgeOnCritical && criticalOverlay
                    ? GRAPH_TONE_COLOR.warning
                    : "currentColor"
              }
              className={
                edgeOnCritical && criticalOverlay
                  ? "cursor-pointer"
                  : "cursor-pointer text-muted-foreground/40"
              }
              initial={false}
              animate={{
                opacity,
                strokeWidth: isFocused ? 3 : edgeOnCritical && criticalOverlay ? 2 : 1,
              }}
              transition={{ duration: motionDuration }}
              onMouseEnter={() => onFocusEdge(edge.id)}
              onClick={(event) => {
                event.stopPropagation()
                onFocusEdge(edge.id)
              }}
            >
              <title>{GRAPH_EDGE_KIND_LABEL[edge.kind]}</title>
            </motion.line>
          )
        })}
        {snapshot.nodes.map((node) => {
          const pos = positions.get(node.id)
          if (!pos) return null
          const radius = node.kind === "project" ? 22 : 10
          const isFocus = focusedNodeId === node.id
          const critical = isCriticalNode(node)
          const opacity = criticalOverlay && !critical ? 0.2 : 1
          return (
            <g key={node.id} transform={`translate(${pos.x}, ${pos.y})`}>
              <motion.g
                onMouseEnter={() => onFocusNode(node.id)}
                onFocus={() => onFocusNode(node.id)}
                onClick={() => onFocusNode(node.id)}
                tabIndex={0}
                role="button"
                aria-label={`${GRAPH_NODE_KIND_LABEL[node.kind]}: ${node.label}${critical ? " (kritischer Pfad)" : ""}`}
                className="cursor-pointer [transform-box:fill-box] [transform-origin:center] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                initial={
                  prefersReducedMotion ? false : { scale: 0.6, opacity: 0 }
                }
                animate={{ scale: 1, opacity }}
                whileHover={prefersReducedMotion ? undefined : { scale: 1.12 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
                transition={{ duration: motionDuration }}
              >
                {critical && (
                  <circle
                    r={radius + 4}
                    fill="none"
                    stroke={GRAPH_TONE_COLOR.warning}
                    strokeWidth={2}
                    strokeDasharray="3 2"
                  />
                )}
                <circle
                  r={radius}
                  fill={GRAPH_TONE_COLOR[node.tone]}
                  stroke={isFocus ? "#0f172a" : "white"}
                  strokeWidth={isFocus ? 3 : 1.5}
                />
                {node.kind === "project" && (
                  <text
                    y={5}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="600"
                    fill="white"
                  >
                    {firstChars(node.label, 12)}
                  </text>
                )}
              </motion.g>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function CountsLegend({ snapshot }: { snapshot: ProjectGraphSnapshot }) {
  const entries = Object.entries(snapshot.counts.by_node_kind).filter(
    ([, n]) => (n ?? 0) > 0,
  )
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      {entries.map(([kind, count]) => (
        <span
          key={kind}
          className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-muted-foreground"
        >
          <span
            className={`h-2 w-2 rounded-full ${legendColorClass(kind as GraphNode["kind"])}`}
          />
          {GRAPH_NODE_KIND_LABEL[kind as GraphNode["kind"]] ?? kind} · {count}
        </span>
      ))}
    </div>
  )
}

function GraphDetailPanel({
  projectId,
  snapshot,
  node,
  edge,
  onEdgeDeleted,
}: {
  projectId: string
  snapshot: ProjectGraphSnapshot
  node: GraphNode | null
  edge: GraphEdge | null
  onEdgeDeleted: () => void
}) {
  if (edge) {
    return (
      <EdgeDetail
        projectId={projectId}
        snapshot={snapshot}
        edge={edge}
        onEdgeDeleted={onEdgeDeleted}
      />
    )
  }
  if (node) return <NodeDetail node={node} />
  return (
    <div className="rounded-md border bg-card p-3 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">Kein Fokus</p>
      <p className="mt-1 text-xs">
        Knoten oder Kante auswaehlen, um Details und Aktionen zu sehen.
      </p>
    </div>
  )
}

function NodeDetail({ node }: { node: GraphNode }) {
  const sim = (
    node.attributes as
      | {
          simulation?: {
            cost_delta_eur: number | null
            time_delta_days: number | null
          } | null
        }
      | undefined
  )?.simulation
  return (
    <div className="rounded-md border bg-card p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {GRAPH_NODE_KIND_LABEL[node.kind]}
          </p>
          <p className="font-medium">{node.label}</p>
        </div>
        {isCriticalNode(node) && <Badge variant="warning">Kritisch</Badge>}
      </div>
      {node.detail && (
        <p className="mt-1 text-xs text-muted-foreground">{node.detail}</p>
      )}
      {sim && (sim.cost_delta_eur != null || sim.time_delta_days != null) && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          {sim.cost_delta_eur != null && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-400">
              Kosten {sim.cost_delta_eur >= 0 ? "+" : ""}
              {sim.cost_delta_eur.toLocaleString("de-DE")} EUR
            </span>
          )}
          {sim.time_delta_days != null && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-400">
              Zeit {sim.time_delta_days >= 0 ? "+" : ""}
              {sim.time_delta_days} Tage
            </span>
          )}
        </div>
      )}
      {node.href && (
        <Link
          href={node.href}
          className="mt-3 inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
        >
          Detail oeffnen
          <ExternalLink className="h-3 w-3" aria-hidden />
        </Link>
      )}
    </div>
  )
}

function EdgeDetail({
  projectId,
  snapshot,
  edge,
  onEdgeDeleted,
}: {
  projectId: string
  snapshot: ProjectGraphSnapshot
  edge: GraphEdge
  onEdgeDeleted: () => void
}) {
  const [isDeleting, setIsDeleting] = React.useState(false)
  const source = snapshot.nodes.find((node) => node.id === edge.source_node_id)
  const target = snapshot.nodes.find((node) => node.id === edge.target_node_id)
  const critical = source != null && target != null && isCriticalNode(source) && isCriticalNode(target)
  const editable = edge.dependency_id != null

  return (
    <div className="rounded-md border bg-card p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Kante
          </p>
          <p className="font-medium">{GRAPH_EDGE_KIND_LABEL[edge.kind]}</p>
        </div>
        <Badge variant={editable ? "info" : "outline"}>
          {editable ? "Manuell" : "Derived"}
        </Badge>
      </div>
      <dl className="mt-3 space-y-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Von</dt>
          <dd className="font-medium">{source?.label ?? edge.source_node_id}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Nach</dt>
          <dd className="font-medium">{target?.label ?? edge.target_node_id}</dd>
        </div>
        {edge.label && (
          <div>
            <dt className="text-muted-foreground">Label</dt>
            <dd>{edge.label}</dd>
          </div>
        )}
        <div>
          <dt className="text-muted-foreground">Quelle</dt>
          <dd>{editable ? `Dependency ${edge.dependency_id}` : "Domain-Aggregation"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Kritikalitaet</dt>
          <dd>{critical ? "Critical Path" : "Normal"}</dd>
        </div>
      </dl>
      {editable && (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="mt-3"
          disabled={isDeleting}
          onClick={async () => {
            if (
              !window.confirm(
                "Diese Abhaengigkeit wirklich loeschen? Das kann andere Pfade beeinflussen.",
              )
            ) {
              return
            }
            setIsDeleting(true)
            try {
              await deleteDependency(projectId, edge.dependency_id!)
              onEdgeDeleted()
            } finally {
              setIsDeleting(false)
            }
          }}
        >
          {isDeleting ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          )}
          Loeschen
        </Button>
      )}
    </div>
  )
}

async function deleteDependency(
  projectId: string,
  dependencyId: string,
): Promise<void> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/dependencies/${encodeURIComponent(dependencyId)}`,
    { method: "DELETE" },
  )
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      msg = body.error?.message ?? msg
    } catch {
      // ignore non-json errors
    }
    window.alert(`Abhaengigkeit konnte nicht geloescht werden: ${msg}`)
    throw new Error(msg)
  }
}

function GraphCanvasLoading() {
  return (
    <div className="flex h-[520px] min-h-[360px] items-center justify-center rounded-md border bg-muted/30 text-sm text-muted-foreground md:h-[620px]">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
      3D-Graph wird geladen ...
    </div>
  )
}

function hasWebGL2(): boolean {
  if (typeof document === "undefined") return false
  try {
    const canvas = document.createElement("canvas")
    return Boolean(canvas.getContext("webgl2"))
  } catch {
    return false
  }
}

function firstChars(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}...`
}

function legendColorClass(kind: GraphNode["kind"]): string {
  if (kind === "risk") return "bg-amber-600"
  if (kind === "project" || kind === "milestone") return "bg-blue-600"
  if (kind === "decision" || kind === "recommendation") return "bg-violet-600"
  if (kind === "budget") return "bg-yellow-600"
  if (kind === "stakeholder") return "bg-cyan-600"
  return "bg-slate-500"
}

function computePositions(nodes: GraphNode[]): Map<string, Position> {
  const width = 720
  const height = 540
  const cx = width / 2
  const cy = height / 2
  const positions = new Map<string, Position>()

  const projectNode = nodes.find((n) => n.kind === "project")
  if (projectNode) positions.set(projectNode.id, { x: cx, y: cy })

  const grouped = new Map<GraphNode["kind"], GraphNode[]>()
  for (const node of nodes) {
    if (node.kind === "project") continue
    const bucket = grouped.get(node.kind) ?? []
    bucket.push(node)
    grouped.set(node.kind, bucket)
  }

  let ringIndex = 1
  for (const kind of RING_ORDER) {
    const bucket = grouped.get(kind)
    if (!bucket?.length) continue
    const radius = 70 + ringIndex * 50
    bucket.forEach((node, index) => {
      const angle = (2 * Math.PI * index) / bucket.length - Math.PI / 2
      positions.set(node.id, {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      })
    })
    ringIndex += 1
  }

  return positions
}
