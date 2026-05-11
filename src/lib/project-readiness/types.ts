/**
 * PROJ-56 — Project Readiness types.
 *
 * The readiness layer answers "what's missing to run this project
 * with confidence?" It complements the existing operational
 * `ProjectHealthSummary` (budget / risks / schedule / stakeholders)
 * by surfacing structural setup gaps.
 */

export type ReadinessStatus = "satisfied" | "open" | "not_applicable"

export type ReadinessSeverity = "blocker" | "warning" | "info"

export type ReadinessState = "not_ready" | "ready_with_gaps" | "ready"

/**
 * Stable string IDs for individual readiness checks. New keys must
 * be appended at the end so existing analytics/audit references
 * stay stable.
 */
export type ReadinessKey =
  | "project_goal"
  | "project_method"
  | "planned_dates"
  | "schedule_units" // phases (waterfall) OR sprints (scrum) OR neither (kanban)
  | "project_lead"
  | "responsible_user"
  | "team_members"
  | "stakeholders_captured"
  | "stakeholders_assessed"
  | "budget_planned" // only if budget module active
  | "risks_captured" // open or explicit "none" confirmation
  | "report_snapshot_created" // only if output_rendering active

export interface ReadinessItem {
  key: ReadinessKey
  status: ReadinessStatus
  severity: ReadinessSeverity
  label: string
  explanation: string
  /** Deep link into the surface that resolves the gap. */
  target_url: string
}

export interface ReadinessNextAction {
  label: string
  /** Sub-label / explanation rendered under the action title. */
  description: string
  /** Severity drives the action's visual weight. */
  severity: ReadinessSeverity
  target_url: string
}

export interface ProjectReadinessSnapshot {
  project_id: string
  /** Captured server-side so the FE doesn't compute "stale" labels. */
  generated_at: string
  state: ReadinessState
  items: ReadinessItem[]
  /** Top-3 actionable next steps, sorted by severity then category. */
  next_actions: ReadinessNextAction[]
  /** Quick counters for KPI surfaces. */
  counts: {
    open_blockers: number
    open_warnings: number
    satisfied: number
    not_applicable: number
  }
}
