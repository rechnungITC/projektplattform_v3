"use client"

import { Loader2, RotateCcw } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type {
  GraphNode,
  ProjectGraphSnapshot,
} from "@/lib/project-graph/types"

interface ProjectGraphViewProps {
  projectId: string
}

/**
 * PROJ-58-β-UI — no-new-dep SVG renderer for the project graph.
 *
 * The Tech Design called for a library decision (react-flow /
 * cytoscape). Adopting a new framework is CIA-review territory
 * (.claude/rules/continuous-improvement.md), so this MVP ships a
 * concentric SVG layout:
 *
 *   - The project node sits at the center.
 *   - The remaining nodes are grouped by kind (phase → milestone
 *     → work_item → risk → decision → stakeholder → budget) and
 *     placed on rings around the center. Within each ring nodes
 *     are evenly distributed.
 *   - Edges are drawn as straight SVG lines.
 *
 * That is enough to show "what is connected to what". Critical-
 * path overlays, edge editing, decision simulation, drag-to-
 * rearrange and 3D are explicit deferred slices (γ / δ / ε / ζ /
 * η in the PROJ-58 spec) — they will need the library decision
 * to be made via CIA review.
 */
export function ProjectGraphView({ projectId }: ProjectGraphViewProps) {
  const [snapshot, setSnapshot] =
    React.useState<ProjectGraphSnapshot | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadTick, setReloadTick] = React.useState(0)

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
            // ignore
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Projekt-Graph</CardTitle>
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
      </CardHeader>
      <CardContent>
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Graph wird
            geladen …
          </p>
        )}
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            Graph fehlgeschlagen: {error}
          </p>
        )}
        {snapshot && snapshot.nodes.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Noch keine Inhalte im Projekt, die graphisch dargestellt werden
            können.
          </p>
        )}
        {snapshot && snapshot.nodes.length > 0 && (
          <GraphSvg snapshot={snapshot} />
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// SVG layout — concentric rings by node kind
// ---------------------------------------------------------------------------

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

const TONE_FILL: Record<GraphNode["tone"], string> = {
  info: "#60a5fa",
  warning: "#f59e0b",
  critical: "#ef4444",
  success: "#10b981",
  muted: "#94a3b8",
}

const KIND_LABEL: Record<GraphNode["kind"], string> = {
  project: "Projekt",
  phase: "Phasen",
  milestone: "Meilensteine",
  work_item: "Work Items",
  stakeholder: "Stakeholder",
  risk: "Risiken",
  decision: "Entscheidungen",
  budget: "Budget",
  recommendation: "Vorschläge",
}

function GraphSvg({ snapshot }: { snapshot: ProjectGraphSnapshot }) {
  const positions = React.useMemo(
    () => computePositions(snapshot.nodes),
    [snapshot.nodes],
  )

  const width = 720
  const height = 540
  const [focusedNodeId, setFocusedNodeId] = React.useState<string | null>(null)
  const focused =
    focusedNodeId != null
      ? snapshot.nodes.find((n) => n.id === focusedNodeId) ?? null
      : null

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border bg-card">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Projekt-Graph"
          className="h-[420px] w-full"
        >
          {/* Edges (lines first → drawn behind nodes) */}
          {snapshot.edges.map((edge) => {
            const a = positions.get(edge.source_node_id)
            const b = positions.get(edge.target_node_id)
            if (!a || !b) return null
            return (
              <line
                key={edge.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="currentColor"
                className="text-muted-foreground/40"
                strokeWidth={1}
              />
            )
          })}
          {/* Nodes */}
          {snapshot.nodes.map((node) => {
            const pos = positions.get(node.id)
            if (!pos) return null
            const radius = node.kind === "project" ? 22 : 10
            const isFocus = focusedNodeId === node.id
            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onMouseEnter={() => setFocusedNodeId(node.id)}
                onFocus={() => setFocusedNodeId(node.id)}
                onClick={() => setFocusedNodeId(node.id)}
                tabIndex={0}
                role="button"
                aria-label={`${KIND_LABEL[node.kind]}: ${node.label}`}
                className="cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <circle
                  r={radius}
                  fill={TONE_FILL[node.tone]}
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
              </g>
            )
          })}
        </svg>
      </div>
      <CountsLegend snapshot={snapshot} />
      {focused && <NodeDetail node={focused} />}
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
            className="h-2 w-2 rounded-full"
            style={{
              backgroundColor:
                TONE_FILL[
                  kind === "project"
                    ? "info"
                    : kind === "risk"
                      ? "warning"
                      : kind === "milestone"
                        ? "info"
                        : "muted"
                ],
            }}
          />
          {KIND_LABEL[kind as GraphNode["kind"]] ?? kind} · {count}
        </span>
      ))}
    </div>
  )
}

function NodeDetail({ node }: { node: GraphNode }) {
  return (
    <div className="rounded-md border bg-card p-3 text-sm">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {KIND_LABEL[node.kind]}
      </p>
      <p className="font-medium">{node.label}</p>
      {node.detail && (
        <p className="mt-1 text-xs text-muted-foreground">{node.detail}</p>
      )}
      {node.href && (
        <Link
          href={node.href}
          className="mt-2 inline-block text-xs text-primary underline-offset-4 hover:underline"
        >
          Detail öffnen →
        </Link>
      )}
    </div>
  )
}

function firstChars(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`
}

/**
 * Concentric-rings layout:
 *
 *   - project node at (cx, cy).
 *   - Each subsequent ring holds one node kind, spaced evenly
 *     around 360°. The ring radius grows with kind order.
 */
function computePositions(nodes: GraphNode[]): Map<string, Position> {
  const width = 720
  const height = 540
  const cx = width / 2
  const cy = height / 2

  const positions = new Map<string, Position>()

  // 1) Project node at center.
  const projectNode = nodes.find((n) => n.kind === "project")
  if (projectNode) positions.set(projectNode.id, { x: cx, y: cy })

  // 2) Group remaining nodes by kind.
  const grouped = new Map<GraphNode["kind"], GraphNode[]>()
  for (const n of nodes) {
    if (n.kind === "project") continue
    const bucket = grouped.get(n.kind) ?? []
    bucket.push(n)
    grouped.set(n.kind, bucket)
  }

  // 3) Walk RING_ORDER, place each bucket on its own ring.
  let ringIndex = 1
  for (const kind of RING_ORDER) {
    const bucket = grouped.get(kind)
    if (!bucket || bucket.length === 0) continue
    const radius = 70 + ringIndex * 50
    bucket.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / bucket.length - Math.PI / 2
      positions.set(node.id, {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      })
    })
    ringIndex += 1
  }

  return positions
}
