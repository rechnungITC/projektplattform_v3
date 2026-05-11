/**
 * PROJ-64 — Global Dashboard / My Work Inbox.
 *
 * Wire-format types shared by the frontend and the upcoming
 * `/api/dashboard/summary` aggregation endpoint. The backend slice
 * implements the route; the frontend slice ships against this
 * contract and gracefully empty-states sections that are still
 * pending.
 *
 * Section-level result blocks let one failed rollup degrade
 * independently instead of blanking the whole dashboard.
 */

import type { HealthLight, HealthState } from "@/lib/project-health/types"
import type { ApprovalStatus } from "@/types/decision-approval"
import type { LifecycleStatus, ProjectType } from "@/types/project"
import type { ProjectMethod } from "@/types/project-method"
import type {
  WorkItemKind,
  WorkItemPriority,
  WorkItemStatus,
} from "@/types/work-item"

/** Dashboard preset-tab identifiers. */
export type DashboardPreset = "my_work" | "project_health" | "approvals"

export const DASHBOARD_PRESETS: readonly DashboardPreset[] = [
  "my_work",
  "project_health",
  "approvals",
] as const

export const DASHBOARD_PRESET_LABELS: Record<DashboardPreset, string> = {
  my_work: "My Work",
  project_health: "Project Health",
  approvals: "Approvals",
}

/** Filter chips inside the My Work panel. */
export type MyWorkFilter =
  | "all"
  | "overdue"
  | "due_soon"
  | "blocked"
  | "in_progress"

export const MY_WORK_FILTERS: readonly MyWorkFilter[] = [
  "all",
  "overdue",
  "due_soon",
  "blocked",
  "in_progress",
] as const

export const MY_WORK_FILTER_LABELS: Record<MyWorkFilter, string> = {
  all: "Alle",
  overdue: "Überfällig",
  due_soon: "Bald fällig",
  blocked: "Blockiert",
  in_progress: "In Arbeit",
}

/**
 * Section-level wrapper. Each rollup carries its own state so a
 * single failure (RLS, RPC error, capped query) does not blank
 * the whole dashboard surface.
 */
export type DashboardSectionState =
  | "loading"
  | "ready"
  | "error"
  | "unavailable"

export interface DashboardSectionEnvelope<T> {
  state: DashboardSectionState
  data: T | null
  error?: string | null
}

/** Top-level KPI counters rendered in the strip. */
export interface DashboardKpiCounters {
  open_assigned: number
  overdue: number
  pending_approvals: number
  at_risk_projects: number
}

/** Single row in the My Work panel. */
export interface MyWorkRow {
  work_item_id: string
  project_id: string
  project_name: string
  project_method: ProjectMethod | null
  kind: WorkItemKind
  title: string
  status: WorkItemStatus
  priority: WorkItemPriority
  /** ISO date — earliest of (planned_end, milestone_target_date) when present. */
  due_date: string | null
  /** Computed server-side; FE only consumes. */
  is_overdue: boolean
  /** Computed server-side; FE only consumes. */
  is_blocked: boolean
  /** Deep link into the existing work-item detail / project surface. */
  href: string
}

/** Single row in the Approvals panel. */
export interface ApprovalRow {
  decision_id: string
  decision_title: string
  project_id: string
  project_name: string
  approver_id: string
  submitted_at: string | null
  deadline_at: string | null
  status: ApprovalStatus
  href: string
}

/** Single row in the Project Health panel. */
export interface ProjectHealthExceptionRow {
  project_id: string
  project_name: string
  project_type: ProjectType
  project_method: ProjectMethod | null
  lifecycle_status: LifecycleStatus
  health: HealthLight | "unknown"
  budget_state: HealthState
  risk_state: HealthState
  schedule_state: HealthState
  stakeholder_state: HealthState
  /** Short human-readable reason — e.g. "Budget 112% · 3 überfällige Meilensteine". */
  reason: string
  href: string
}

/** Severity for budget/risk alert rows. */
export type AlertSeverity = "critical" | "warning" | "info"

export interface AlertRow {
  id: string
  project_id: string
  project_name: string
  /** Domain-specific alert type — drives the icon + label. */
  kind:
    | "budget_overrun"
    | "budget_threshold"
    | "missing_fx_rate"
    | "critical_risk"
    | "stakeholder_critical_path"
    | "schedule_overdue"
  title: string
  detail: string | null
  severity: AlertSeverity
  href: string
}

/** Single row in the Recent Reports panel. */
export interface ReportShortcut {
  snapshot_id: string
  project_id: string
  project_name: string
  kind: "status_report" | "executive_summary"
  version: number
  generated_at: string
  href: string
}

/**
 * Full dashboard payload.
 *
 * Each section uses an envelope so one failed rollup can show
 * an inline section-error while peers keep rendering.
 */
export interface DashboardSummary {
  user_context: {
    user_id: string
    tenant_id: string
    /** Whether the active membership is a tenant admin. */
    is_tenant_admin: boolean
  }
  generated_at: string
  kpis: DashboardKpiCounters
  my_work: DashboardSectionEnvelope<{
    items: MyWorkRow[]
    /** Total before MVP cap (caller decides cap). */
    total: number
    capped: boolean
  }>
  approvals: DashboardSectionEnvelope<{
    items: ApprovalRow[]
    total: number
  }>
  project_health: DashboardSectionEnvelope<{
    items: ProjectHealthExceptionRow[]
    total_accessible_projects: number
  }>
  alerts: DashboardSectionEnvelope<{
    items: AlertRow[]
  }>
  reports: DashboardSectionEnvelope<{
    items: ReportShortcut[]
  }>
  /**
   * Permissions surfaced for the QuickActions strip.
   * Backend evaluates module-active + role-gate semantics so the
   * frontend renders disabled-with-reason states consistently.
   */
  capabilities: {
    can_create_project: boolean
    can_create_work_item: boolean
    can_open_approvals: boolean
    can_open_reports: boolean
  }
}

/** Empty envelope helper used while the backend slice is pending. */
export function emptyEnvelope<T>(state: DashboardSectionState): DashboardSectionEnvelope<T> {
  return { state, data: null }
}