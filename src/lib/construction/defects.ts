/**
 * PROJ-45-β — pure defect predicates and display labels. No I/O, so both the
 * API routes and the /frontend slice can share one definition.
 *
 * The overdue rule has an authoritative TWIN in SQL:
 * `public._construction_defect_is_overdue(status, due_date)` in migration
 * 20260818104358. Both must agree, and the boundary cases below are pinned by
 * tests on purpose — the counters in `construction_defect_summary` come from the
 * SQL side while the row badges come from here, so a divergence would show up as
 * a list that contradicts its own header.
 */

import type {
  ConstructionDefectAction,
  ConstructionDefectEventType,
  ConstructionDefectSeverity,
  ConstructionDefectStatus,
} from "@/types/construction-defect"

export {
  CONSTRUCTION_DEFECT_ACTIONS,
  CONSTRUCTION_DEFECT_EVENT_TYPES,
  CONSTRUCTION_DEFECT_REASON_REQUIRED_ACTIONS,
  CONSTRUCTION_DEFECT_SEVERITIES,
  CONSTRUCTION_DEFECT_STATUSES,
} from "@/types/construction-defect"

/**
 * Statuses in which a lapsed deadline is the contractor's delay and therefore
 * counts as overdue.
 *
 * `erledigt` is deliberately NOT here: completion has been reported and the
 * review is pending, so the delay would be the site management's — the list
 * would blame the wrong party. That case has its own signal, see
 * {@link isDefectAwaitingReview}. `geprueft` and `verworfen` are terminal.
 */
const OVERDUE_ELIGIBLE_STATUSES: readonly ConstructionDefectStatus[] = [
  "offen",
  "in_bearbeitung",
] as const

/** `YYYY-MM-DD` in the runtime's local reckoning, matching a Postgres `date`. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Overdue ⇔ a deadline exists, the status is non-terminal-and-contractor-side,
 * and the deadline has LAPSED. Due today is not overdue (`<`, not `<=`) — it
 * lapses tomorrow.
 */
export function isDefectOverdue(
  status: ConstructionDefectStatus | string | null | undefined,
  dueDate: string | null | undefined,
  today: string = todayIso()
): boolean {
  if (!dueDate) return false
  if (!(OVERDUE_ELIGIBLE_STATUSES as readonly string[]).includes(status ?? "")) {
    return false
  }
  // Both sides are `YYYY-MM-DD`, so a lexicographic compare is a date compare.
  return dueDate < today
}

/** Completion reported, review pending — the counterpart signal to overdue. */
export function isDefectAwaitingReview(
  status: ConstructionDefectStatus | string | null | undefined
): boolean {
  return status === "erledigt"
}

export interface ConstructionDefectFlags {
  isOverdue: boolean
  isAwaitingReview: boolean
}

/** Both derived flags for one row, so callers never re-implement either rule. */
export function deriveDefectFlags(
  defect: {
    status: ConstructionDefectStatus | string | null | undefined
    due_date: string | null | undefined
  },
  today: string = todayIso()
): ConstructionDefectFlags {
  return {
    isOverdue: isDefectOverdue(defect.status, defect.due_date, today),
    isAwaitingReview: isDefectAwaitingReview(defect.status),
  }
}

/** The date the API uses as "today" when filtering overdue rows server-side. */
export function defectOverdueCutoff(): string {
  return todayIso()
}

/** Statuses the server-side `overdue=true` filter narrows to. */
export const CONSTRUCTION_DEFECT_OVERDUE_STATUSES = OVERDUE_ELIGIBLE_STATUSES

// ── Display labels (German — this is domain-facing copy) ────────────────────

export const CONSTRUCTION_DEFECT_SEVERITY_LABELS: Record<
  ConstructionDefectSeverity,
  string
> = {
  gering: "Gering",
  erheblich: "Erheblich",
  gravierend: "Gravierend",
}

export const CONSTRUCTION_DEFECT_STATUS_LABELS: Record<
  ConstructionDefectStatus,
  string
> = {
  offen: "Offen",
  in_bearbeitung: "In Bearbeitung",
  erledigt: "Fertiggemeldet",
  geprueft: "Geprüft",
  verworfen: "Verworfen",
}

export const CONSTRUCTION_DEFECT_EVENT_LABELS: Record<
  ConstructionDefectEventType,
  string
> = {
  angelegt: "Angelegt",
  in_arbeit_genommen: "In Arbeit genommen",
  fertiggemeldet: "Fertiggemeldet",
  geprueft: "Geprüft",
  zurueckgewiesen: "Zurückgewiesen",
  verworfen: "Verworfen",
  wieder_aufgenommen: "Wieder aufgenommen",
}

export const CONSTRUCTION_DEFECT_ACTION_LABELS: Record<
  ConstructionDefectAction,
  string
> = {
  in_arbeit: "In Arbeit nehmen",
  fertigmelden: "Fertigmelden",
  pruefen: "Abnehmen",
  zurueckweisen: "Zurückweisen",
  verwerfen: "Verwerfen",
  wieder_aufnehmen: "Wieder aufnehmen",
}
