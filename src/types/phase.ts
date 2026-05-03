/**
 * Phase types for PROJ-19 (Phases & Milestones — Cross-cutting Schedule
 * Backbone). The phase status state-machine mirrors the backend's
 * `transition_phase_status` DB function (see PROJ-19 Tech Design § D).
 */

export type PhaseStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "cancelled"

export const PHASE_STATUSES: readonly PhaseStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "cancelled",
] as const

export const PHASE_STATUS_LABELS: Record<PhaseStatus, string> = {
  planned: "Geplant",
  in_progress: "In Arbeit",
  completed: "Abgeschlossen",
  cancelled: "Abgebrochen",
}

/**
 * Allowed phase status transitions per Tech Design § D.
 * `completed → in_progress` is intentionally allowed for re-opens (audit
 * note required, enforced at API/DB layer); `cancelled → planned` revives.
 */
export const ALLOWED_PHASE_TRANSITIONS: Record<PhaseStatus, PhaseStatus[]> = {
  planned: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: ["in_progress"],
  cancelled: ["planned"],
}

export interface Phase {
  id: string
  tenant_id: string
  project_id: string
  name: string
  description: string | null
  planned_start: string | null
  planned_end: string | null
  actual_start: string | null
  actual_end: string | null
  sequence_number: number
  status: PhaseStatus
  created_by: string
  created_at: string
  updated_at: string
  is_deleted: boolean
  /** PROJ-35-β — domain-authoritative Critical-Path-Marker. PM opts the
   *  phase in via the Edit-Phase-Dialog; default false. Drives the
   *  Critical-Path-Indikator in the Stakeholder-Health-Dashboard. */
  is_critical?: boolean
}

export interface PhaseWithCounts extends Phase {
  /** Number of milestones attached to this phase, when joined. */
  milestone_count?: number
  /** Number of work_packages (PROJ-9) attached, when joined. */
  work_package_count?: number
}
