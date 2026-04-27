/**
 * Milestone types for PROJ-19. Milestone status is enforced via DB CHECK
 * (no DB function — the state machine is too simple to justify one, see
 * Tech Design § D / § K).
 */

export type MilestoneStatus =
  | "planned"
  | "achieved"
  | "missed"
  | "cancelled"

export const MILESTONE_STATUSES: readonly MilestoneStatus[] = [
  "planned",
  "achieved",
  "missed",
  "cancelled",
] as const

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  planned: "Geplant",
  achieved: "Erreicht",
  missed: "Verpasst",
  cancelled: "Abgebrochen",
}

/**
 * Allowed milestone status transitions per Tech Design § D.
 * `achieved` is terminal except that `actual_date` remains editable.
 * `missed → achieved` is allowed for late achievements.
 */
export const ALLOWED_MILESTONE_TRANSITIONS: Record<
  MilestoneStatus,
  MilestoneStatus[]
> = {
  planned: ["achieved", "missed", "cancelled"],
  achieved: [],
  missed: ["achieved"],
  cancelled: ["planned"],
}

export interface Milestone {
  id: string
  tenant_id: string
  project_id: string
  phase_id: string | null
  name: string
  description: string | null
  target_date: string
  actual_date: string | null
  status: MilestoneStatus
  created_by: string
  created_at: string
  updated_at: string
  is_deleted: boolean
}

/**
 * Computed overdue: a planned milestone is overdue when its `target_date`
 * is before today (Europe/Berlin "today" — but we compute via the local
 * Date for the browser; backend recomputes server-side).
 *
 * Per Tech Design § D — overdue is **derived**, never stored. This
 * helper is the single source of truth for the UI.
 */
export function isOverdue(
  milestone: Pick<Milestone, "status" | "target_date">
): boolean {
  if (milestone.status !== "planned") return false
  const target = parseIsoDateLocal(milestone.target_date)
  if (!target) return false
  const today = startOfToday()
  return target < today
}

function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function parseIsoDateLocal(iso: string): Date | null {
  const parts = iso.slice(0, 10).split("-")
  if (parts.length !== 3) return null
  const [yearStr, monthStr, dayStr] = parts
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}
