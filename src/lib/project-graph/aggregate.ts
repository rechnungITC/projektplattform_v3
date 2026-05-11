/**
 * PROJ-58 — Project graph aggregator.
 *
 * Read-only snapshot of the project as a typed node/edge graph.
 * The FE consumer renders the graph with whichever library it
 * picks (react-flow / cytoscape / d3); this aggregator is
 * library-agnostic.
 *
 * Sources pulled in parallel:
 *   - projects                       → 1 project node
 *   - phases                         → phase nodes + belongs_to → project
 *   - milestones                     → milestone nodes + belongs_to → phase OR project
 *   - work_items                     → work-item nodes + belongs_to → parent / phase
 *   - dependencies (polymorphic)     → depends_on / blocks edges
 *   - risks                          → risk nodes + influences → linked entity
 *   - decisions                      → decision nodes
 *   - stakeholders                   → stakeholder nodes
 *
 * Budget is surfaced as a single "budget summary" node when items
 * exist — drill-down into the budget tab handles the rest.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { getProjectSectionHref } from "@/lib/method-templates/routing"
import type { ProjectMethod } from "@/types/project-method"
import type { WorkItemKind, WorkItemStatus } from "@/types/work-item"

import type {
  GraphEdge,
  GraphEdgeKind,
  GraphNode,
  GraphNodeKind,
  ProjectGraphSnapshot,
} from "./types"

interface AggregateArgs {
  supabase: SupabaseClient
  projectId: string
  tenantId: string
  now?: Date
}

const NODE_CAP_PER_KIND = 80 // bound the snapshot for the MVP

export async function resolveProjectGraph(
  args: AggregateArgs,
): Promise<ProjectGraphSnapshot> {
  const now = args.now ?? new Date()
  const href = (section: string, method: ProjectMethod | null) =>
    getProjectSectionHref(args.projectId, section, method)

  const [
    projectRes,
    phasesRes,
    milestonesRes,
    workItemsRes,
    dependenciesRes,
    risksRes,
    decisionsRes,
    stakeholdersRes,
    budgetItemsRes,
  ] = await Promise.all([
    args.supabase
      .from("projects")
      .select("id, name, description, project_method, lifecycle_status")
      .eq("id", args.projectId)
      .maybeSingle(),
    args.supabase
      .from("phases")
      .select("id, name, status, sequence_number")
      .eq("project_id", args.projectId)
      .eq("is_deleted", false)
      .order("sequence_number", { ascending: true })
      .limit(NODE_CAP_PER_KIND),
    args.supabase
      .from("milestones")
      .select("id, name, target_date, status, phase_id, is_deleted")
      .eq("project_id", args.projectId)
      .eq("is_deleted", false)
      .order("target_date", { ascending: true })
      .limit(NODE_CAP_PER_KIND),
    args.supabase
      .from("work_items")
      .select(
        "id, kind, title, status, parent_id, phase_id, milestone_id, is_deleted",
      )
      .eq("project_id", args.projectId)
      .eq("is_deleted", false)
      .limit(NODE_CAP_PER_KIND * 2),
    args.supabase
      .from("dependencies")
      .select("id, from_type, from_id, to_type, to_id, constraint_type")
      .eq("project_id", args.projectId)
      .limit(NODE_CAP_PER_KIND * 2),
    args.supabase
      .from("risks")
      .select("id, title, status, score")
      .eq("project_id", args.projectId)
      .order("score", { ascending: false })
      .limit(NODE_CAP_PER_KIND),
    args.supabase
      .from("decisions")
      .select("id, title, is_revised, decided_at")
      .eq("project_id", args.projectId)
      .order("decided_at", { ascending: false })
      .limit(NODE_CAP_PER_KIND),
    args.supabase
      .from("stakeholders")
      .select("id, name, is_active, influence, impact")
      .eq("project_id", args.projectId)
      .eq("is_active", true)
      .limit(NODE_CAP_PER_KIND),
    args.supabase
      .from("budget_items")
      .select("id", { count: "exact", head: true })
      .eq("project_id", args.projectId)
      .eq("is_active", true),
  ])

  const project = projectRes.data as
    | {
        id: string
        name: string
        description: string | null
        project_method: ProjectMethod | null
        lifecycle_status: string
      }
    | null
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  if (!project) {
    return emptySnapshot(args.projectId, now)
  }

  const method = project.project_method

  // --- Project node ---
  const projectNodeId = nodeId("project", project.id)
  nodes.push({
    id: projectNodeId,
    kind: "project",
    label: project.name,
    detail: project.description ?? null,
    tone: project.lifecycle_status === "active" ? "info" : "muted",
    href: href("overview", method),
    attributes: { lifecycle_status: project.lifecycle_status },
  })

  // --- Phases ---
  for (const p of (phasesRes.data ?? []) as Array<{
    id: string
    name: string
    status: string | null
    sequence_number: number | null
  }>) {
    const pid = nodeId("phase", p.id)
    nodes.push({
      id: pid,
      kind: "phase",
      label: p.name,
      detail: `Phase ${p.sequence_number ?? "?"} · ${p.status ?? "planned"}`,
      tone: p.status === "active" ? "info" : "muted",
      href: href("phases", method),
      attributes: { status: p.status, sequence_number: p.sequence_number },
    })
    edges.push({
      id: edgeId(pid, projectNodeId, "belongs_to"),
      source_node_id: pid,
      target_node_id: projectNodeId,
      kind: "belongs_to",
      label: null,
    })
  }

  // --- Milestones ---
  for (const m of (milestonesRes.data ?? []) as Array<{
    id: string
    name: string
    target_date: string | null
    status: string | null
    phase_id: string | null
  }>) {
    const mid = nodeId("milestone", m.id)
    const overdue =
      m.target_date && new Date(m.target_date).getTime() < now.getTime() &&
      m.status !== "completed" &&
      m.status !== "achieved"
    nodes.push({
      id: mid,
      kind: "milestone",
      label: m.name,
      detail: m.target_date
        ? `Ziel: ${new Date(m.target_date).toLocaleDateString("de-DE")}`
        : "Kein Termin",
      tone: overdue ? "critical" : m.status === "completed" ? "success" : "info",
      href: href("phases", method),
      attributes: { target_date: m.target_date, status: m.status },
    })
    const parent = m.phase_id ? nodeId("phase", m.phase_id) : projectNodeId
    edges.push({
      id: edgeId(mid, parent, "belongs_to"),
      source_node_id: mid,
      target_node_id: parent,
      kind: "belongs_to",
      label: null,
    })
  }

  // --- Work Items ---
  for (const w of (workItemsRes.data ?? []) as Array<{
    id: string
    kind: WorkItemKind
    title: string
    status: WorkItemStatus
    parent_id: string | null
    phase_id: string | null
  }>) {
    const wid = nodeId("work_item", w.id)
    nodes.push({
      id: wid,
      kind: "work_item",
      label: w.title,
      detail: `${w.kind} · ${w.status}`,
      tone:
        w.status === "blocked"
          ? "critical"
          : w.status === "done"
            ? "success"
            : w.status === "in_progress"
              ? "info"
              : "muted",
      href: href("backlog", method) + `?work_item=${w.id}`,
      attributes: { kind: w.kind, status: w.status },
    })
    const parentId = w.parent_id
      ? nodeId("work_item", w.parent_id)
      : w.phase_id
        ? nodeId("phase", w.phase_id)
        : projectNodeId
    edges.push({
      id: edgeId(wid, parentId, "belongs_to"),
      source_node_id: wid,
      target_node_id: parentId,
      kind: "belongs_to",
      label: null,
    })
  }

  // --- Dependencies (polymorphic) ---
  for (const d of (dependenciesRes.data ?? []) as Array<{
    id: string
    from_type: string
    from_id: string
    to_type: string
    to_id: string
    constraint_type: string | null
  }>) {
    const fromKind = depTypeToKind(d.from_type)
    const toKind = depTypeToKind(d.to_type)
    if (!fromKind || !toKind) continue
    edges.push({
      id: edgeId(
        nodeId(fromKind, d.from_id),
        nodeId(toKind, d.to_id),
        "depends_on",
      ),
      source_node_id: nodeId(fromKind, d.from_id),
      target_node_id: nodeId(toKind, d.to_id),
      kind: "depends_on",
      label: d.constraint_type ?? null,
    })
  }

  // --- Risks ---
  for (const r of (risksRes.data ?? []) as Array<{
    id: string
    title: string
    status: string | null
    score: number | null
  }>) {
    const rid = nodeId("risk", r.id)
    nodes.push({
      id: rid,
      kind: "risk",
      label: r.title,
      detail: `Score ${r.score ?? 0} · ${r.status ?? "open"}`,
      tone:
        r.status !== "open"
          ? "muted"
          : (r.score ?? 0) >= 20
            ? "critical"
            : (r.score ?? 0) >= 16
              ? "warning"
              : "info",
      href: href("risks", method),
      attributes: { score: r.score, status: r.status },
    })
    edges.push({
      id: edgeId(rid, projectNodeId, "increases_risk"),
      source_node_id: rid,
      target_node_id: projectNodeId,
      kind: "increases_risk",
      label: null,
    })
  }

  // --- Decisions ---
  for (const d of (decisionsRes.data ?? []) as Array<{
    id: string
    title: string
    is_revised: boolean
    decided_at: string | null
  }>) {
    const did = nodeId("decision", d.id)
    nodes.push({
      id: did,
      kind: "decision",
      label: d.title,
      detail: d.is_revised
        ? "Revidiert"
        : d.decided_at
          ? `Entschieden: ${new Date(d.decided_at).toLocaleDateString("de-DE")}`
          : "Offen",
      tone: d.is_revised ? "muted" : "info",
      href: `/projects/${args.projectId}/entscheidungen?decision=${d.id}`,
      attributes: { is_revised: d.is_revised },
    })
    edges.push({
      id: edgeId(did, projectNodeId, "influences"),
      source_node_id: did,
      target_node_id: projectNodeId,
      kind: "influences",
      label: null,
    })
  }

  // --- Stakeholders ---
  for (const s of (stakeholdersRes.data ?? []) as Array<{
    id: string
    name: string | null
    influence: string | null
    impact: string | null
  }>) {
    const sid = nodeId("stakeholder", s.id)
    const high = s.influence === "high" || s.impact === "high"
    nodes.push({
      id: sid,
      kind: "stakeholder",
      label: s.name ?? "Stakeholder",
      detail:
        s.influence || s.impact
          ? `Einfluss: ${s.influence ?? "?"} · Impact: ${s.impact ?? "?"}`
          : "Noch nicht bewertet",
      tone: high ? "warning" : "info",
      href: href("stakeholder", method),
      attributes: { influence: s.influence, impact: s.impact },
    })
    edges.push({
      id: edgeId(sid, projectNodeId, "requires_stakeholder"),
      source_node_id: sid,
      target_node_id: projectNodeId,
      kind: "requires_stakeholder",
      label: null,
    })
  }

  // --- Budget summary node (if items exist) ---
  const budgetItemsCount = budgetItemsRes.count ?? 0
  if (budgetItemsCount > 0) {
    const bid = nodeId("budget", "summary")
    nodes.push({
      id: bid,
      kind: "budget",
      label: "Budget",
      detail: `${budgetItemsCount} aktive Posten`,
      tone: "info",
      href: href("budget", method),
      attributes: { active_items: budgetItemsCount },
    })
    edges.push({
      id: edgeId(bid, projectNodeId, "causes_cost"),
      source_node_id: bid,
      target_node_id: projectNodeId,
      kind: "causes_cost",
      label: null,
    })
  }

  // --- Drop dangling edges first (target node not present due to caps). ---
  const nodeIds = new Set(nodes.map((n) => n.id))
  const liveEdges = edges.filter(
    (e) => nodeIds.has(e.source_node_id) && nodeIds.has(e.target_node_id),
  )

  // --- Counts — reflect what consumers will actually receive. ---
  const byNode: Partial<Record<GraphNodeKind, number>> = {}
  for (const n of nodes) {
    byNode[n.kind] = (byNode[n.kind] ?? 0) + 1
  }
  const byEdge: Partial<Record<GraphEdgeKind, number>> = {}
  for (const e of liveEdges) {
    byEdge[e.kind] = (byEdge[e.kind] ?? 0) + 1
  }

  return {
    project_id: args.projectId,
    generated_at: now.toISOString(),
    nodes,
    edges: liveEdges,
    counts: {
      nodes: nodes.length,
      edges: liveEdges.length,
      by_node_kind: byNode,
      by_edge_kind: byEdge,
    },
  }
}

function emptySnapshot(
  projectId: string,
  now: Date,
): ProjectGraphSnapshot {
  return {
    project_id: projectId,
    generated_at: now.toISOString(),
    nodes: [],
    edges: [],
    counts: { nodes: 0, edges: 0, by_node_kind: {}, by_edge_kind: {} },
  }
}

function nodeId(kind: GraphNodeKind, rawId: string): string {
  return `${kind}:${rawId}`
}

function edgeId(from: string, to: string, kind: GraphEdgeKind): string {
  return `${kind}:${from}→${to}`
}

function depTypeToKind(t: string): GraphNodeKind | null {
  switch (t) {
    case "project":
      return "project"
    case "phase":
      return "phase"
    case "work_package":
    case "todo":
      return "work_item"
    default:
      return null
  }
}
