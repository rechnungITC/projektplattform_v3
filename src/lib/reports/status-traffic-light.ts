/**
 * PROJ-21 — Status-Traffic-Light formula.
 *
 * Hard-coded per Tech Design § Decision 3:
 *   - GREEN: no overdue milestones AND no critical-impact open risks
 *   - YELLOW: ≤ 2 overdue milestones OR 1 critical open risk
 *   - RED: anything else (≥ 3 overdue milestones OR ≥ 2 critical risks
 *     OR mix of overdue + critical)
 *
 * "Critical" follows the established 5×5 matrix convention from
 * `risk-matrix.tsx`: a risk is critical when `probability * impact >= 16`
 * AND its status is `open`. Mitigated/accepted/closed risks never
 * count, regardless of score.
 *
 * "Overdue" is determined against the snapshot's reference date —
 * usually `now()` at the moment of generation. A milestone is overdue
 * when `due_date` has passed and the milestone is not yet completed.
 *
 * Pure function. No I/O. Trivially unit-testable.
 */

import type {
  SnapshotMilestoneRef,
  SnapshotRiskRef,
  TrafficLight,
} from "./types"

/** Risk score threshold for "critical" — matches risk-matrix.tsx. */
export const CRITICAL_RISK_SCORE_THRESHOLD = 16

/** Milestone statuses that should NOT count as overdue regardless of due_date. */
const COMPLETED_MILESTONE_STATUSES = new Set([
  "completed",
  "achieved",
  "closed",
  "cancelled",
])

export function isCriticalOpenRisk(risk: SnapshotRiskRef): boolean {
  if (risk.status !== "open") return false
  return risk.score >= CRITICAL_RISK_SCORE_THRESHOLD
}

export function isOverdueMilestone(
  milestone: SnapshotMilestoneRef,
  referenceDate: Date,
): boolean {
  if (!milestone.due_date) return false
  if (COMPLETED_MILESTONE_STATUSES.has(milestone.status)) return false
  const due = new Date(milestone.due_date)
  if (Number.isNaN(due.getTime())) return false
  return due.getTime() < referenceDate.getTime()
}

export function countOverdueMilestones(
  milestones: readonly SnapshotMilestoneRef[],
  referenceDate: Date,
): number {
  return milestones.reduce(
    (n, m) => n + (isOverdueMilestone(m, referenceDate) ? 1 : 0),
    0,
  )
}

export function countCriticalOpenRisks(
  risks: readonly SnapshotRiskRef[],
): number {
  return risks.reduce((n, r) => n + (isCriticalOpenRisk(r) ? 1 : 0), 0)
}

export interface StatusTrafficLightInput {
  milestones: readonly SnapshotMilestoneRef[]
  risks: readonly SnapshotRiskRef[]
  /** When omitted, defaults to the current moment. Tests pass a fixed date. */
  now?: Date
}

export interface StatusTrafficLightResult {
  light: TrafficLight
  overdue_milestone_count: number
  critical_risk_count: number
}

/**
 * Computes the traffic-light per PROJ-21 § ST-04.
 *
 * The thresholds are deterministic and locked in this file. If they
 * ever need to be tenant-configurable, that's a PROJ-21b concern;
 * a `ReportThresholds` argument can be added then.
 */
export function computeStatusTrafficLight(
  input: StatusTrafficLightInput,
): StatusTrafficLightResult {
  const referenceDate = input.now ?? new Date()
  const overdue = countOverdueMilestones(input.milestones, referenceDate)
  const critical = countCriticalOpenRisks(input.risks)

  let light: TrafficLight
  if (overdue === 0 && critical === 0) {
    light = "green"
  } else if (overdue <= 2 && critical === 0) {
    light = "yellow"
  } else if (overdue === 0 && critical === 1) {
    light = "yellow"
  } else {
    light = "red"
  }

  return {
    light,
    overdue_milestone_count: overdue,
    critical_risk_count: critical,
  }
}
