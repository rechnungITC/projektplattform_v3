/**
 * Sprint types for PROJ-9 (Tech Design § C). State machine is
 * intentionally minimal — `planned → active → closed`. Only one active
 * sprint per project at a time (DB function `set_sprint_state`).
 */

export type SprintState = "planned" | "active" | "closed"

export const SPRINT_STATES: readonly SprintState[] = [
  "planned",
  "active",
  "closed",
] as const

export const SPRINT_STATE_LABELS: Record<SprintState, string> = {
  planned: "Geplant",
  active: "Aktiv",
  closed: "Abgeschlossen",
}

export const ALLOWED_SPRINT_STATE_TRANSITIONS: Record<
  SprintState,
  SprintState[]
> = {
  planned: ["active"],
  active: ["closed"],
  closed: [],
}

export interface Sprint {
  id: string
  tenant_id: string
  project_id: string
  name: string
  goal: string | null
  start_date: string | null
  end_date: string | null
  state: SprintState
  /**
   * PROJ-43-β — Domain-Marker: PM kennzeichnet Sprint als kritisch für den
   * Projekterfolg. Treibt den Critical-Path-Indikator im Stakeholder-Health-
   * Dashboard. Method-gated (Scrum/SAFe/NULL only). Default false.
   */
  is_critical: boolean
  created_by: string
  created_at: string
  updated_at: string
}
