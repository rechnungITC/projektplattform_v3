/**
 * PROJ-64 — Dashboard / My Work Inbox aggregator.
 *
 * Resolves the operational inbox for the authenticated user in a
 * single tenant-scoped pass. Section-level error handling: every
 * rollup runs in its own try/catch so one failed section degrades
 * to an inline error instead of blanking the whole dashboard.
 *
 * Project access semantics: a project shows up only when the user
 * has an explicit `project_memberships` row. Tenant admins do not
 * receive an admin-by-default fall-through (resolved per spec
 * § Open Architecture Questions).
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { isModuleActive } from "@/lib/tenant-settings/modules"
import { getProjectSectionHref } from "@/lib/method-templates/routing"
import type {
  AlertRow,
  AlertSeverity,
  ApprovalRow,
  DashboardKpiCounters,
  DashboardSectionEnvelope,
  DashboardSummary,
  MyWorkRow,
  ProjectHealthExceptionRow,
  ReportShortcut,
} from "@/types/dashboard"
import type { ApprovalStatus } from "@/types/decision-approval"
import type { LifecycleStatus, ProjectType } from "@/types/project"
import type { ProjectMethod } from "@/types/project-method"
import type { ModuleKey, TenantSettings } from "@/types/tenant-settings"
import type {
  WorkItemKind,
  WorkItemPriority,
  WorkItemStatus,
} from "@/types/work-item"
import type { HealthLight, HealthState } from "@/lib/project-health/types"

const MY_WORK_LIMIT = 25
/**
 * Fetch window for the My Work section. The JS post-sort below
 * picks the top {@link MY_WORK_LIMIT} by (blocked → overdue →
 * priority → due) — so we must fetch enough rows to virtually
 * guarantee that the highest-priority items are present in the
 * window even when the user has many open assigned items.
 *
 * We deliberately do NOT use a server-side `ORDER BY priority`
 * because `work_items.priority` is a `text` column and Postgres
 * would sort it alphabetically (medium > low > high > critical),
 * which would EXCLUDE critical items from the fetch window for
 * power users. The fetch order is therefore `planned_end ASC` so
 * the most time-sensitive items are pulled first; the JS sort
 * surfaces priority once the window is in memory.
 */
const MY_WORK_FETCH_CAP = MY_WORK_LIMIT * 4 // 100 rows
const ALERT_LIMIT = 20
const HEALTH_LIMIT = 12
const APPROVAL_LIMIT = 25
const REPORT_LIMIT = 5
const DUE_SOON_DAYS = 7
const CRITICAL_RISK_SCORE = 16

interface ProjectRef {
  id: string
  tenant_id: string
  name: string
  project_type: ProjectType
  project_method: ProjectMethod | null
  lifecycle_status: LifecycleStatus
  responsible_user_id: string | null
}

interface ResolveDashboardSummaryArgs {
  supabase: SupabaseClient
  userId: string
  tenantId: string
  isTenantAdmin: boolean
  /**
   * Optional override for "now". Tests pass a fixed timestamp; the
   * route uses `new Date()`.
   */
  now?: Date
}

/**
 * Build the full dashboard summary. The function never throws —
 * it returns a populated `DashboardSummary` whose section
 * envelopes describe individual successes and failures.
 */
export async function resolveDashboardSummary(
  args: ResolveDashboardSummaryArgs,
): Promise<DashboardSummary> {
  const now = args.now ?? new Date()
  const generated_at = now.toISOString()

  // 1. Resolve the user's accessible projects (project_memberships).
  //    A single SELECT joining `projects` keeps it to one round-trip.
  const projectsEnvelope = await loadAccessibleProjects(args)

  // 2. Resolve tenant settings once for module gating + capabilities.
  const settings = await loadTenantSettings(args)

  // 3. Run section rollups in parallel. Each rollup is wrapped so a
  //    single failure surfaces as `state='error'` without blanking
  //    the rest of the dashboard.
  const [
    myWork,
    approvals,
    projectHealth,
    alerts,
    reports,
  ] = await Promise.all([
    safeSection<{
      items: MyWorkRow[]
      total: number
      capped: boolean
    }>(() => loadMyWork(args, projectsEnvelope.data, now)),
    safeSection<{ items: ApprovalRow[]; total: number }>(() =>
      loadApprovals(args, settings),
    ),
    safeSection<{
      items: ProjectHealthExceptionRow[]
      total_accessible_projects: number
    }>(() => loadProjectHealth(args, projectsEnvelope.data, now)),
    safeSection<{ items: AlertRow[] }>(() =>
      loadAlerts(args, projectsEnvelope.data, settings, now),
    ),
    safeSection<{ items: ReportShortcut[] }>(() =>
      loadRecentReports(args, projectsEnvelope.data, settings),
    ),
  ])

  // 4. KPIs are derived from the sections that succeeded. We do not
  //    re-query — the numbers stay consistent with what the panels
  //    render below.
  const kpis = deriveKpis({
    myWork: myWork.data?.items ?? [],
    approvals: approvals.data?.items ?? [],
    projectHealth: projectHealth.data?.items ?? [],
  })

  return {
    user_context: {
      user_id: args.userId,
      tenant_id: args.tenantId,
      is_tenant_admin: args.isTenantAdmin,
    },
    generated_at,
    kpis,
    my_work: myWork,
    approvals,
    project_health: projectHealth,
    alerts,
    reports,
    capabilities: deriveCapabilities(args.isTenantAdmin, settings),
  }
}

// ----------------------------------------------------------------------------
// Section helpers
// ----------------------------------------------------------------------------

interface AccessibleProjects {
  projects: ProjectRef[]
}

async function loadAccessibleProjects(
  args: ResolveDashboardSummaryArgs,
): Promise<{ data: AccessibleProjects }> {
  // Stricter than RLS: explicit project membership only.
  // Tenant admins do not see projects they are not members of (per
  // spec § Open Architecture Questions resolution).
  const { data, error } = await args.supabase
    .from("project_memberships")
    .select(
      "project_id, projects!inner(id, tenant_id, name, project_type, project_method, lifecycle_status, responsible_user_id, is_deleted)",
    )
    .eq("user_id", args.userId)
    .eq("projects.tenant_id", args.tenantId)
    .eq("projects.is_deleted", false)
    .limit(500)

  if (error) {
    // We don't throw here — every section depends on the project
    // list, so failure should surface per-section. We return an
    // empty list and let `safeSection` mark the dependent rollups
    // as error/empty downstream.
    return { data: { projects: [] } }
  }

  const projects: ProjectRef[] = (data ?? [])
    .map((row) => {
      const r = row as unknown as {
        projects:
          | {
              id: string
              tenant_id: string
              name: string
              project_type: ProjectType
              project_method: ProjectMethod | null
              lifecycle_status: LifecycleStatus
              responsible_user_id: string | null
            }
          | Array<{
              id: string
              tenant_id: string
              name: string
              project_type: ProjectType
              project_method: ProjectMethod | null
              lifecycle_status: LifecycleStatus
              responsible_user_id: string | null
            }>
      }
      const p = Array.isArray(r.projects) ? r.projects[0] : r.projects
      if (!p) return null
      return {
        id: p.id,
        tenant_id: p.tenant_id,
        name: p.name,
        project_type: p.project_type,
        project_method: p.project_method,
        lifecycle_status: p.lifecycle_status,
        responsible_user_id: p.responsible_user_id,
      }
    })
    .filter((p): p is ProjectRef => p !== null)

  return { data: { projects } }
}

async function loadTenantSettings(
  args: ResolveDashboardSummaryArgs,
): Promise<TenantSettings | null> {
  const { data } = await args.supabase
    .from("tenant_settings")
    .select(
      "tenant_id, active_modules, privacy_defaults, ai_provider_config, retention_overrides, budget_settings, output_rendering_settings, cost_settings, risk_score_overrides, created_at, updated_at",
    )
    .eq("tenant_id", args.tenantId)
    .maybeSingle()
  return (data as TenantSettings | null) ?? null
}

async function loadMyWork(
  args: ResolveDashboardSummaryArgs,
  accessible: AccessibleProjects,
  now: Date,
): Promise<{ items: MyWorkRow[]; total: number; capped: boolean }> {
  if (accessible.projects.length === 0) {
    return { items: [], total: 0, capped: false }
  }
  const projectIds = accessible.projects.map((p) => p.id)
  const projectMap = new Map(accessible.projects.map((p) => [p.id, p]))

  // Pull active work items assigned to the user. Fetch order is
  // `planned_end ASC` (most time-sensitive first) — we intentionally
  // skip a server-side priority sort because the DB column is text
  // and would sort alphabetically (medium > low > high > critical).
  // The JS post-sort below applies the authoritative priority order
  // (blocked → overdue → priority → due). See MY_WORK_FETCH_CAP for
  // the window-size rationale.
  const { data, error, count } = await args.supabase
    .from("work_items")
    .select(
      "id, project_id, kind, title, status, priority, planned_start, planned_end, milestone_id, sprint_id",
      { count: "exact" },
    )
    .eq("tenant_id", args.tenantId)
    .in("project_id", projectIds)
    .eq("responsible_user_id", args.userId)
    .eq("is_deleted", false)
    .in("status", ["todo", "in_progress", "blocked"])
    .order("planned_end", { ascending: true, nullsFirst: false })
    .limit(MY_WORK_FETCH_CAP)

  if (error) throw new Error(`my_work: ${error.message}`)

  const todayMs = now.getTime()
  const rows: MyWorkRow[] = (data ?? [])
    .map((r) => {
      const project = projectMap.get(r.project_id as string)
      if (!project) return null
      const dueDate = (r.planned_end as string | null) ?? null
      const isOverdue = computeOverdue(dueDate, r.status as WorkItemStatus, todayMs)
      const isBlocked = r.status === "blocked"
      const href = `/projects/${project.id}/backlog?work_item=${r.id}`
      return {
        work_item_id: r.id as string,
        project_id: project.id,
        project_name: project.name,
        project_method: project.project_method,
        kind: r.kind as WorkItemKind,
        title: r.title as string,
        status: r.status as WorkItemStatus,
        priority: r.priority as WorkItemPriority,
        due_date: dueDate,
        is_overdue: isOverdue,
        is_blocked: isBlocked,
        href,
      } satisfies MyWorkRow
    })
    .filter((r): r is MyWorkRow => r !== null)

  const sorted = sortMyWork(rows, todayMs)
  const total = count ?? sorted.length
  const capped = sorted.length > MY_WORK_LIMIT
  return {
    items: capped ? sorted.slice(0, MY_WORK_LIMIT) : sorted,
    total,
    capped,
  }
}

async function loadApprovals(
  args: ResolveDashboardSummaryArgs,
  settings: TenantSettings | null,
): Promise<{ items: ApprovalRow[]; total: number }> {
  if (settings && !isModuleActive(settings, "decisions" as ModuleKey)) {
    return { items: [], total: 0 }
  }
  const { data, error } = await args.supabase
    .from("decision_approvers")
    .select(
      "id, decision_id, magic_link_expires_at, response, responded_at, " +
        "stakeholders!inner(linked_user_id), " +
        "decisions!inner(title, project_id, is_revised, " +
        "projects!inner(name, tenant_id), " +
        "decision_approval_state!inner(status, submitted_at, deadline_at))",
    )
    .eq("stakeholders.linked_user_id", args.userId)
    .eq("decisions.projects.tenant_id", args.tenantId)
    .is("response", null)
    .order("created_at", { ascending: false })
    .limit(APPROVAL_LIMIT)

  if (error) throw new Error(`approvals: ${error.message}`)

  const items: ApprovalRow[] = (data ?? [])
    .map((r) => {
      const row = r as unknown as {
        id: string
        decision_id: string
        decisions: {
          title: string
          project_id: string
          is_revised: boolean
          projects?: { name?: string } | null
          decision_approval_state?: {
            status: ApprovalStatus
            submitted_at: string | null
            deadline_at: string | null
          } | null
        } | null
      }
      if (!row.decisions) return null
      if (row.decisions.is_revised) return null
      const state = row.decisions.decision_approval_state
      if (!state || state.status !== "pending") return null
      const item: ApprovalRow = {
        decision_id: row.decision_id,
        decision_title: row.decisions.title,
        project_id: row.decisions.project_id,
        project_name: row.decisions.projects?.name ?? "Projekt",
        approver_id: row.id,
        submitted_at: state.submitted_at,
        deadline_at: state.deadline_at,
        status: state.status,
        href: `/projects/${row.decisions.project_id}/entscheidungen?decision=${row.decision_id}`,
      }
      return item
    })
    .filter((r): r is ApprovalRow => r !== null)

  return { items, total: items.length }
}

async function loadProjectHealth(
  args: ResolveDashboardSummaryArgs,
  accessible: AccessibleProjects,
  now: Date,
): Promise<{
  items: ProjectHealthExceptionRow[]
  total_accessible_projects: number
}> {
  const totalAccessibleProjects = accessible.projects.length
  if (totalAccessibleProjects === 0) {
    return { items: [], total_accessible_projects: 0 }
  }
  const projectIds = accessible.projects.map((p) => p.id)

  // Coarse health signals: per-project counts of open critical risks
  // and overdue milestones. Done via two grouped SELECTs so we avoid
  // N+1 fan-out.
  const [risksRes, milestonesRes] = await Promise.all([
    args.supabase
      .from("risks")
      .select("project_id, score, status")
      .eq("tenant_id", args.tenantId)
      .in("project_id", projectIds)
      .eq("status", "open"),
    args.supabase
      .from("milestones")
      .select("project_id, target_date, status, is_deleted")
      .eq("tenant_id", args.tenantId)
      .in("project_id", projectIds)
      .eq("is_deleted", false),
  ])

  if (risksRes.error) throw new Error(`health.risks: ${risksRes.error.message}`)
  if (milestonesRes.error) {
    throw new Error(`health.milestones: ${milestonesRes.error.message}`)
  }

  const todayMs = now.getTime()
  const criticalRiskByProject = new Map<string, number>()
  const openRisksByProject = new Map<string, number>()
  for (const r of risksRes.data ?? []) {
    const pid = r.project_id as string
    openRisksByProject.set(pid, (openRisksByProject.get(pid) ?? 0) + 1)
    const score = (r.score as number) ?? 0
    if (score >= CRITICAL_RISK_SCORE) {
      criticalRiskByProject.set(pid, (criticalRiskByProject.get(pid) ?? 0) + 1)
    }
  }
  const overdueByProject = new Map<string, number>()
  // PROJ-64 L2 polish: also track whether a project has ANY active
  // milestone, so the exception list can suppress "unknown"-health
  // rows for brand-new empty projects (no risks AND no milestones
  // at all) without violating AC-9 ("never show partial data as
  // green/safe").
  const activeMilestoneByProject = new Map<string, number>()
  for (const m of milestonesRes.data ?? []) {
    const pid = m.project_id as string
    const status = (m.status as string | null) ?? "planned"
    if (
      status === "completed" ||
      status === "achieved" ||
      status === "closed" ||
      status === "cancelled"
    ) {
      continue
    }
    activeMilestoneByProject.set(
      pid,
      (activeMilestoneByProject.get(pid) ?? 0) + 1,
    )
    const target = m.target_date as string | null
    if (!target) continue
    const t = new Date(target).getTime()
    if (Number.isNaN(t)) continue
    if (t < todayMs) {
      overdueByProject.set(pid, (overdueByProject.get(pid) ?? 0) + 1)
    }
  }

  const exceptions: ProjectHealthExceptionRow[] = []
  for (const project of accessible.projects) {
    const overdue = overdueByProject.get(project.id) ?? 0
    const critical = criticalRiskByProject.get(project.id) ?? 0
    const openRisks = openRisksByProject.get(project.id) ?? 0
    const scheduleState: HealthState =
      overdue >= 3 ? "red" : overdue > 0 ? "yellow" : openRisks > 0 ? "green" : "empty"
    const riskState: HealthState =
      critical >= 2
        ? "red"
        : critical === 1
          ? "yellow"
          : openRisks > 0
            ? "green"
            : "empty"
    // Budget + stakeholder rollups are deferred to a per-project
    // call which the dashboard skips for performance — surface them
    // as 'unknown' so the UI flags incomplete data per AC-9.
    const budgetState: HealthState = "unknown"
    const stakeholderState: HealthState = "unknown"
    const lights: HealthState[] = [scheduleState, riskState]
    const health = combineHealthLight(lights)
    if (health === "green") continue
    // PROJ-64 L2 polish: skip brand-new empty projects from the
    // exception list. A project surfaces as "unknown" only when
    // there is no signal at all (no open risks AND no active
    // milestones) — those are not "stale data" per AC-9, they are
    // simply projects without inputs yet. Suppressing them keeps
    // the panel actionable. Projects with partial data (e.g. risks
    // but no milestones) still surface because their light becomes
    // yellow/red/green via the active signal.
    const hasAnySignal =
      openRisks > 0 || (activeMilestoneByProject.get(project.id) ?? 0) > 0
    if (health === "unknown" && !hasAnySignal) continue

    exceptions.push({
      project_id: project.id,
      project_name: project.name,
      project_type: project.project_type,
      project_method: project.project_method,
      lifecycle_status: project.lifecycle_status,
      health,
      budget_state: budgetState,
      risk_state: riskState,
      schedule_state: scheduleState,
      stakeholder_state: stakeholderState,
      reason: buildHealthReason({ overdue, critical, openRisks }),
      href: getProjectSectionHref(
        project.id,
        "overview",
        project.project_method,
      ),
    })
  }

  exceptions.sort((a, b) => severityRank(b.health) - severityRank(a.health))
  return {
    items: exceptions.slice(0, HEALTH_LIMIT),
    total_accessible_projects: totalAccessibleProjects,
  }
}

async function loadAlerts(
  args: ResolveDashboardSummaryArgs,
  accessible: AccessibleProjects,
  settings: TenantSettings | null,
  now: Date,
): Promise<{ items: AlertRow[] }> {
  if (accessible.projects.length === 0) return { items: [] }
  const projectIds = accessible.projects.map((p) => p.id)
  const projectMap = new Map(accessible.projects.map((p) => [p.id, p]))

  const wantsRisks = settings ? isModuleActive(settings, "risks") : true
  const [risksRes, milestonesRes] = await Promise.all([
    wantsRisks
      ? args.supabase
          .from("risks")
          .select("id, project_id, title, score, status")
          .eq("tenant_id", args.tenantId)
          .in("project_id", projectIds)
          .eq("status", "open")
          .gte("score", CRITICAL_RISK_SCORE)
          .order("score", { ascending: false })
          .limit(ALERT_LIMIT)
      : Promise.resolve({ data: [], error: null }),
    args.supabase
      .from("milestones")
      .select("id, project_id, name, target_date, status, is_deleted")
      .eq("tenant_id", args.tenantId)
      .in("project_id", projectIds)
      .eq("is_deleted", false)
      .order("target_date", { ascending: true })
      .limit(ALERT_LIMIT),
  ])

  if (risksRes.error) throw new Error(`alerts.risks: ${risksRes.error.message}`)
  if (milestonesRes.error) {
    throw new Error(`alerts.milestones: ${milestonesRes.error.message}`)
  }

  const items: AlertRow[] = []
  for (const r of risksRes.data ?? []) {
    const project = projectMap.get(r.project_id as string)
    if (!project) continue
    items.push({
      id: `risk-${r.id}`,
      project_id: project.id,
      project_name: project.name,
      kind: "critical_risk",
      title: r.title as string,
      detail: `Risk-Score ${r.score}`,
      severity: (r.score as number) >= 20 ? "critical" : "warning",
      href: getProjectSectionHref(
        project.id,
        "risks",
        project.project_method,
      ),
    })
  }

  const todayMs = now.getTime()
  for (const m of milestonesRes.data ?? []) {
    const project = projectMap.get(m.project_id as string)
    if (!project) continue
    const status = (m.status as string | null) ?? "planned"
    if (
      status === "completed" ||
      status === "achieved" ||
      status === "closed" ||
      status === "cancelled"
    ) {
      continue
    }
    const target = m.target_date as string | null
    if (!target) continue
    const t = new Date(target).getTime()
    if (Number.isNaN(t) || t >= todayMs) continue
    const daysOverdue = Math.floor((todayMs - t) / (1000 * 60 * 60 * 24))
    items.push({
      id: `milestone-${m.id}`,
      project_id: project.id,
      project_name: project.name,
      kind: "schedule_overdue",
      title: m.name as string,
      detail: `${daysOverdue} ${daysOverdue === 1 ? "Tag" : "Tage"} überfällig`,
      severity: daysOverdue >= 14 ? "critical" : "warning",
      href: getProjectSectionHref(
        project.id,
        "phases",
        project.project_method,
      ),
    })
  }

  items.sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
  return { items: items.slice(0, ALERT_LIMIT) }
}

async function loadRecentReports(
  args: ResolveDashboardSummaryArgs,
  accessible: AccessibleProjects,
  settings: TenantSettings | null,
): Promise<{ items: ReportShortcut[] }> {
  if (settings && !isModuleActive(settings, "output_rendering")) {
    return { items: [] }
  }
  if (accessible.projects.length === 0) {
    // No `project_id IN (…)` would still match any tenant snapshot
    // via RLS. Short-circuit to match the dashboard's stricter
    // project-access stance — the user sees Recent Reports only
    // for projects they are a member of.
    return { items: [] }
  }
  const projectIds = accessible.projects.map((p) => p.id)
  const { data, error } = await args.supabase
    .from("report_snapshots")
    .select("id, kind, version, generated_at, project_id, projects!inner(name)")
    .eq("tenant_id", args.tenantId)
    .in("project_id", projectIds)
    .order("generated_at", { ascending: false })
    .limit(REPORT_LIMIT)

  if (error) throw new Error(`reports: ${error.message}`)

  const items: ReportShortcut[] = (data ?? [])
    .map((r) => {
      const row = r as unknown as {
        id: string
        kind: "status_report" | "executive_summary"
        version: number
        generated_at: string
        project_id: string
        projects: { name: string } | { name: string }[] | null
      }
      const proj = Array.isArray(row.projects) ? row.projects[0] : row.projects
      if (!proj) return null
      return {
        snapshot_id: row.id,
        project_id: row.project_id,
        project_name: proj.name,
        kind: row.kind,
        version: row.version,
        generated_at: row.generated_at,
        href: `/reports/snapshots/${row.id}`,
      } satisfies ReportShortcut
    })
    .filter((x): x is ReportShortcut => x !== null)

  return { items }
}

// ----------------------------------------------------------------------------
// Pure helpers
// ----------------------------------------------------------------------------

function deriveKpis(args: {
  myWork: MyWorkRow[]
  approvals: ApprovalRow[]
  projectHealth: ProjectHealthExceptionRow[]
}): DashboardKpiCounters {
  return {
    open_assigned: args.myWork.length,
    overdue: args.myWork.filter((r) => r.is_overdue).length,
    pending_approvals: args.approvals.length,
    at_risk_projects: args.projectHealth.filter(
      (p) => p.health === "red" || p.health === "yellow",
    ).length,
  }
}

function deriveCapabilities(
  isTenantAdmin: boolean,
  settings: TenantSettings | null,
): DashboardSummary["capabilities"] {
  const reportsActive = settings ? isModuleActive(settings, "output_rendering") : true
  return {
    can_create_project: isTenantAdmin,
    // Per-project edit role decides on the project-room-side; from
    // the global dashboard we only know whether the user has any
    // membership at all — backend leaves the global "Work Item"
    // shortcut as a deep link into the project list (the FE will
    // disable the action when the user has no projects).
    can_create_work_item: true,
    can_open_approvals: true,
    can_open_reports: reportsActive,
  }
}

function computeOverdue(
  dueDate: string | null,
  status: WorkItemStatus,
  todayMs: number,
): boolean {
  if (!dueDate) return false
  if (status === "done" || status === "cancelled") return false
  const t = new Date(dueDate).getTime()
  if (Number.isNaN(t)) return false
  return t < todayMs
}

function sortMyWork(rows: MyWorkRow[], todayMs: number): MyWorkRow[] {
  const priorityWeight: Record<WorkItemPriority, number> = {
    critical: 3,
    high: 2,
    medium: 1,
    low: 0,
  }
  return [...rows].sort((a, b) => {
    if (a.is_blocked !== b.is_blocked) return a.is_blocked ? -1 : 1
    if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1
    const pw = priorityWeight[b.priority] - priorityWeight[a.priority]
    if (pw !== 0) return pw
    return dueRank(a.due_date, todayMs) - dueRank(b.due_date, todayMs)
  })
}

function dueRank(due: string | null, todayMs: number): number {
  if (!due) return Number.MAX_SAFE_INTEGER
  const t = new Date(due).getTime()
  if (Number.isNaN(t)) return Number.MAX_SAFE_INTEGER
  return Math.max(0, t - todayMs)
}

function combineHealthLight(states: HealthState[]): HealthLight | "unknown" {
  let worst: "green" | "yellow" | "unknown" = "green"
  let allEmpty = true
  for (const s of states) {
    if (s !== "empty" && s !== "unknown") allEmpty = false
    if (s === "red") return "red"
    if (s === "yellow") worst = "yellow"
    if (s === "unknown" && worst === "green") worst = "unknown"
  }
  if (allEmpty) return "unknown"
  return worst
}

function severityRank(state: HealthLight | "unknown"): number {
  if (state === "red") return 3
  if (state === "yellow") return 2
  if (state === "unknown") return 1
  return 0
}

function severityWeight(s: AlertSeverity): number {
  if (s === "critical") return 2
  if (s === "warning") return 1
  return 0
}

function buildHealthReason({
  overdue,
  critical,
  openRisks,
}: {
  overdue: number
  critical: number
  openRisks: number
}): string {
  const parts: string[] = []
  if (critical > 0) {
    parts.push(`${critical} kritische${critical === 1 ? "s" : ""} Risiko${critical === 1 ? "" : "s"}`)
  }
  if (overdue > 0) {
    parts.push(`${overdue} überfällige${overdue === 1 ? "r" : ""} Meilenstein${overdue === 1 ? "" : "e"}`)
  }
  if (parts.length === 0) {
    return openRisks > 0
      ? `${openRisks} offene Risiken — keine kritischen Schwellen überschritten`
      : "Keine konkreten Signale erkannt"
  }
  return parts.join(" · ")
}

/**
 * Wrap a section rollup so its failures degrade independently. The
 * caller passes a thunk; we either return `{state:'ready', data}`
 * or `{state:'error', data:null, error}`.
 */
async function safeSection<T>(
  fn: () => Promise<T>,
): Promise<DashboardSectionEnvelope<T>> {
  try {
    const data = await fn()
    return { state: "ready", data }
  } catch (err) {
    return {
      state: "error",
      data: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

