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
  ComplianceLane,
  CostLaneItem,
  GraphEdge,
  GraphEdgeKind,
  GraphNode,
  GraphNodeKind,
  NodeAssignee,
  ProjectGoalPlaceholder,
  ProjectGraphSnapshot,
  TrajectoryEpic,
  TrajectoryExtension,
  TrajectoryLayoutHints,
  TrajectorySprint,
} from "./types"

interface AggregateArgs {
  supabase: SupabaseClient
  projectId: string
  tenantId: string
  now?: Date
  /**
   * PROJ-65 ε.1 (L13) — when true, the snapshot is enriched with
   * the `trajectory` field needed by `TrajectoryGraphView`. Default
   * `false` keeps the PROJ-58 surface byte-for-byte compatible.
   */
  includeTrajectory?: boolean
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
    contextSourcesRes,
  ] = await Promise.all([
    args.supabase
      .from("projects")
      .select("id, name, description, project_method, lifecycle_status")
      .eq("id", args.projectId)
      .maybeSingle(),
    args.supabase
      .from("phases")
      .select("id, name, status, sequence_number, is_critical")
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
      .select("id, title, is_revised, decided_at, rationale")
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
    // PROJ-58-ζ — recent context-sources fuel the
    // recommendation node track (AI suggestions for the graph).
    args.supabase
      .from("context_sources")
      .select("id, kind, title, privacy_class")
      .eq("project_id", args.projectId)
      .order("created_at", { ascending: false })
      .limit(5),
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
    is_critical: boolean | null
  }>) {
    const pid = nodeId("phase", p.id)
    // PROJ-58-δ — critical-path overlay: phases on the critical
    // path render as `warning` regardless of their normal tone.
    nodes.push({
      id: pid,
      kind: "phase",
      label: p.name,
      detail: `Phase ${p.sequence_number ?? "?"} · ${p.status ?? "planned"}${p.is_critical ? " · Kritischer Pfad" : ""}`,
      tone: p.is_critical
        ? "warning"
        : p.status === "active"
          ? "info"
          : "muted",
      href: href("phases", method),
      attributes: {
        status: p.status,
        sequence_number: p.sequence_number,
        is_critical: Boolean(p.is_critical),
      },
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
      // PROJ-58-γ — expose the row id so the FE can DELETE directly.
      dependency_id: d.id,
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
    rationale: string | null
  }>) {
    const did = nodeId("decision", d.id)
    // PROJ-58-ε — decision-simulation stub. Parse "+N €" and
    // "+N Tage" patterns from the rationale so the graph can
    // surface the decision's projected impact. Real per-
    // alternative attributes (cost_delta / time_delta /
    // risk_delta) are a future schema-extension slice; until
    // then this regex-based parse keeps the UI honest about
    // what's documented.
    const sim = parseDecisionSimulation(d.rationale ?? null)
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
      attributes: {
        is_revised: d.is_revised,
        simulation: sim,
      },
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

  // --- Recommendation nodes (PROJ-58-ζ) ---
  // Emit one recommendation node per recent context-source so the
  // graph hints "AI could derive proposals from this input." The
  // real proposal-from-context AI call is the PROJ-44-δ stub; the
  // graph just surfaces the inputs that exist for review.
  for (const c of (contextSourcesRes.data ?? []) as Array<{
    id: string
    kind: string
    title: string
    privacy_class: number
  }>) {
    const cid = nodeId("recommendation", c.id)
    nodes.push({
      id: cid,
      kind: "recommendation",
      label: `Vorschlag: ${c.title}`,
      detail: `Quelle: ${c.kind} · Class ${c.privacy_class}`,
      tone: "muted",
      href: `/stammdaten/context-sources?source=${c.id}`,
      attributes: {
        source_kind: c.kind,
        privacy_class: c.privacy_class,
      },
    })
    edges.push({
      id: edgeId(cid, projectNodeId, "influences"),
      source_node_id: cid,
      target_node_id: projectNodeId,
      kind: "influences",
      label: "AI-Vorschlag",
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

  const baseSnapshot: ProjectGraphSnapshot = {
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

  if (args.includeTrajectory) {
    baseSnapshot.trajectory = await resolveTrajectoryExtension({
      supabase: args.supabase,
      projectId: args.projectId,
      tenantId: args.tenantId,
      method,
      phasesData: (phasesRes.data ?? []) as Array<{
        id: string
        sequence_number: number | null
      }>,
      workItemsData: (workItemsRes.data ?? []) as Array<{
        id: string
        kind: WorkItemKind
        title: string
        parent_id: string | null
      }>,
      budgetItemsCount,
    })
  }

  return baseSnapshot
}

interface TrajectoryAggregateArgs {
  supabase: SupabaseClient
  projectId: string
  tenantId: string
  method: ProjectMethod | null
  phasesData: Array<{ id: string; sequence_number: number | null }>
  workItemsData: Array<{
    id: string
    kind: WorkItemKind
    title: string
    parent_id: string | null
  }>
  budgetItemsCount: number
}

async function resolveTrajectoryExtension(
  args: TrajectoryAggregateArgs,
): Promise<TrajectoryExtension> {
  const epicIds = args.workItemsData
    .filter((w) => w.kind === "epic")
    .map((w) => w.id)

  const [
    sprintsRes,
    lanesRes,
    goalsRes,
    costRes,
    tenantRes,
    sprintWorkRes,
    assigneesRes,
  ] = await Promise.all([
    args.supabase
      .from("sprints")
      .select("id, name, start_date, end_date, state")
      .eq("project_id", args.projectId)
      .order("start_date", { ascending: true, nullsFirst: false })
      .limit(NODE_CAP_PER_KIND),
    args.supabase
      .from("work_item_compliance_lanes")
      .select("work_item_id, lane_key, display_label")
      .eq("tenant_id", args.tenantId)
      .in(
        "work_item_id",
        args.workItemsData.map((w) => w.id),
      )
      .limit(NODE_CAP_PER_KIND * 4),
    args.supabase
      .from("project_goals")
      .select("id, title, status")
      .eq("project_id", args.projectId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .limit(NODE_CAP_PER_KIND),
    args.supabase
      .from("budget_items")
      .select("id, name, planned_amount, planned_currency")
      .eq("project_id", args.projectId)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(NODE_CAP_PER_KIND),
    args.supabase
      .from("tenant_settings")
      .select("active_modules")
      .eq("tenant_id", args.tenantId)
      .maybeSingle(),
    epicIds.length > 0
      ? args.supabase
          .from("work_items")
          .select("id, parent_id, sprint_id")
          .eq("project_id", args.projectId)
          .eq("is_deleted", false)
          .in("parent_id", epicIds)
          .not("sprint_id", "is", null)
      : Promise.resolve({ data: [] }),
    // PROJ-65 ε.2 — assignees per work_item via PROJ-11 work_item_resources
    // joined to resources (display_name, kind, source_stakeholder_id).
    // Stakeholder details (name, role, is_active) are looked up in a
    // second pass below to avoid Supabase nested-select restrictions.
    args.supabase
      .from("work_item_resources")
      .select("work_item_id, resource_id, allocation_pct")
      .eq("tenant_id", args.tenantId)
      .in(
        "work_item_id",
        args.workItemsData.map((w) => w.id),
      )
      .limit(NODE_CAP_PER_KIND * 4),
  ])

  const sprints: TrajectorySprint[] = (sprintsRes.data ?? []).map(
    (s: {
      id: string
      name: string | null
      start_date: string | null
      end_date: string | null
      state: string | null
    }) => ({
      id: s.id,
      name: s.name ?? "Sprint",
      start_date: s.start_date,
      end_date: s.end_date,
      state: s.state,
    }),
  )

  const epicSprintMap = new Map<string, Set<string>>()
  for (const row of (sprintWorkRes.data ?? []) as Array<{
    parent_id: string | null
    sprint_id: string | null
  }>) {
    if (!row.parent_id || !row.sprint_id) continue
    const set = epicSprintMap.get(row.parent_id) ?? new Set<string>()
    set.add(row.sprint_id)
    epicSprintMap.set(row.parent_id, set)
  }
  const epics: TrajectoryEpic[] = args.workItemsData
    .filter((w) => w.kind === "epic")
    .map((w) => ({
      id: w.id,
      title: w.title,
      status: null,
      sprint_ids: Array.from(epicSprintMap.get(w.id) ?? []),
    }))

  const complianceLanes: ComplianceLane[] = (lanesRes.data ?? []).map(
    (row: {
      work_item_id: string
      lane_key: string
      display_label: string | null
    }) => ({
      work_item_id: row.work_item_id,
      lane_key: row.lane_key,
      display_label: row.display_label,
    }),
  )

  const goals: ProjectGoalPlaceholder[] = (goalsRes.data ?? []).map(
    (g: { id: string; title: string; status: string }) => ({
      id: g.id,
      title: g.title,
      status: g.status,
    }),
  )

  const costLaneItems: CostLaneItem[] = (costRes.data ?? []).map(
    (b: {
      id: string
      name: string | null
      planned_amount: number | string | null
      planned_currency: string | null
    }) => ({
      id: b.id,
      label: b.name ?? "Budget-Posten",
      // budget_items.planned_amount is numeric (string in JSON); we
      // present the planned amount as cents for `CostLaneItem.amount_cents`
      // by multiplying by 100 once parsed. Actual spent vs. planned
      // over-budget detection requires a join with budget_postings and
      // is deferred to a follow-up slice (PROJ-22 integration).
      amount_cents:
        b.planned_amount == null
          ? null
          : Math.round(Number(b.planned_amount) * 100),
      currency: b.planned_currency,
      over_budget: false,
    }),
  )

  // PROJ-17 tenant_settings.active_modules is a JSONB array of module
  // keys ("risks", "decisions", "ai_proposals", "budget", "output_rendering", …).
  // Treat budget as enabled when the array contains "budget" OR when
  // the tenant has at least one active budget item (legacy tenants
  // without an explicit toggle).
  const activeModules = tenantRes.data?.active_modules as string[] | null
  const budgetModuleEnabled =
    activeModules == null
      ? args.budgetItemsCount > 0
      : Array.isArray(activeModules) && activeModules.includes("budget")

  const layout_hints: TrajectoryLayoutHints = {
    method: args.method,
    hybrid:
      sprints.length > 0 &&
      args.phasesData.length > 0 &&
      (args.method === null || args.method.startsWith("hybrid")),
    phases_order: [...args.phasesData]
      .sort(
        (a, b) =>
          (a.sequence_number ?? Infinity) - (b.sequence_number ?? Infinity),
      )
      .map((p) => p.id),
    sprints_order: sprints.map((s) => s.id),
    budget_module_enabled: budgetModuleEnabled,
  }

  // PROJ-65 ε.2 — enrich assignees with stakeholder / resource details.
  const resourceIds = Array.from(
    new Set(
      (assigneesRes.data ?? []).map(
        (r: { resource_id: string }) => r.resource_id,
      ),
    ),
  )
  let nodeAssignees: NodeAssignee[] = []
  if (resourceIds.length > 0) {
    const resourcesRes = await args.supabase
      .from("resources")
      .select(
        "id, display_name, kind, source_stakeholder_id, linked_user_id, is_active",
      )
      .eq("tenant_id", args.tenantId)
      .in("id", resourceIds)
      .limit(NODE_CAP_PER_KIND * 4)

    const resources = (resourcesRes.data ?? []) as Array<{
      id: string
      display_name: string
      kind: string | null
      source_stakeholder_id: string | null
      linked_user_id: string | null
      is_active: boolean
    }>
    const stakeholderIds = resources
      .map((r) => r.source_stakeholder_id)
      .filter((v): v is string => v != null)
    const stakeholdersDetailRes =
      stakeholderIds.length > 0
        ? await args.supabase
            .from("stakeholders")
            .select("id, name, role_key, influence, impact, is_active")
            .eq("tenant_id", args.tenantId)
            .in("id", stakeholderIds)
            .limit(NODE_CAP_PER_KIND * 4)
        : { data: [] }

    const stakeholdersById = new Map(
      ((stakeholdersDetailRes.data ?? []) as Array<{
        id: string
        name: string
        role_key: string | null
        influence: string | null
        impact: string | null
        is_active: boolean
      }>).map((s) => [s.id, s] as const),
    )
    const resourcesById = new Map(resources.map((r) => [r.id, r] as const))

    nodeAssignees = (assigneesRes.data ?? []).map(
      (row: {
        work_item_id: string
        resource_id: string
        allocation_pct: number | string | null
      }) => {
        const resource = resourcesById.get(row.resource_id)
        const stakeholder = resource?.source_stakeholder_id
          ? stakeholdersById.get(resource.source_stakeholder_id) ?? null
          : null
        const critical =
          stakeholder?.influence === "high" || stakeholder?.impact === "high"
        const resourceInactive = resource != null && resource.is_active === false
        const stakeholderInactive =
          stakeholder != null && stakeholder.is_active === false
        return {
          work_item_id: row.work_item_id,
          resource_id: row.resource_id,
          stakeholder_id: stakeholder?.id ?? null,
          name:
            stakeholder?.name ?? resource?.display_name ?? "Unbekannt",
          role: stakeholder?.role_key ?? resource?.kind ?? null,
          kind: resource?.kind ?? null,
          is_critical: Boolean(critical),
          // ε.2 ships without sentiment-based positive flag; the field
          // is present so ε.3 / PROJ-35 integration can fill it later.
          is_positive: false,
          // Cost-flag detection requires PROJ-54 resource override rates;
          // hold at false in ε.2, raise in a follow-up slice once the
          // tenant-cost-threshold is wired.
          is_cost_flagged: false,
          allocation_pct:
            row.allocation_pct == null ? null : Number(row.allocation_pct),
          deleted_at:
            resourceInactive || stakeholderInactive
              ? new Date().toISOString()
              : null,
        }
      },
    )
  }

  // PROJ-65 ε.2 — Class-3 cost-clear-view permission.
  // Project-settings table is not yet provisioned (L6 deferred);
  // fall back to "false" so the FE renders masked by default and
  // only opens up when a real permission check lands in /backend.
  const costClearView = false

  return {
    layout_hints,
    sprints,
    epics,
    compliance_lanes: complianceLanes,
    cost_lane_items: costLaneItems,
    goals,
    node_assignees: nodeAssignees,
    cost_clear_view: costClearView,
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

/**
 * PROJ-58-ε — best-effort simulation parser. Extracts cost +
 * time deltas from free-text rationales. Returns `null` when no
 * recognisable token is found.
 */
function parseDecisionSimulation(text: string | null): {
  cost_delta_eur: number | null
  time_delta_days: number | null
} | null {
  if (!text) return null
  const costRe = /([+\-]?)\s*(\d[\d.,]*)\s*(€|EUR)/i
  const timeRe = /([+\-]?)\s*(\d[\d.,]*)\s*(?:Tag(?:e|en)?|d|days?)/i
  const cost = costRe.exec(text)
  const time = timeRe.exec(text)
  const parseAmount = (sign: string, raw: string): number => {
    const n = Number.parseFloat(raw.replace(/\./g, "").replace(",", "."))
    return Number.isFinite(n) ? (sign === "-" ? -n : n) : 0
  }
  if (!cost && !time) return null
  return {
    cost_delta_eur: cost ? parseAmount(cost[1], cost[2]) : null,
    time_delta_days: time ? parseAmount(time[1], time[2]) : null,
  }
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
