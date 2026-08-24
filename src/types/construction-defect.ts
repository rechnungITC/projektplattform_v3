// PROJ-45-β — Construction defect management (Mängelmanagement).
//
// A defect is deliberately NOT a `work_items` row of kind `bug` (lock L9): it is
// not planned work, and in the backlog it would distort velocity, burndown and
// the WBS roll-ups — evaluations that exist precisely because planned work sits
// there. What it genuinely adds over α's two axes is the subcontractor bond and
// the review stage.
//
// Two rights deviations from the house norm live in the RPCs, not here:
//   * reporting  — ANY project member, viewers included (lock L15)
//   * changing / status — `is_tenant_admin` OR `is_project_lead`; the project
//     `editor` is excluded, although the house `edit` level includes them.

/** How bad it is. Ordered, but not otherwise interpreted by the platform. */
export type ConstructionDefectSeverity = "gering" | "erheblich" | "gravierend"

export const CONSTRUCTION_DEFECT_SEVERITIES: readonly ConstructionDefectSeverity[] = [
  "gering",
  "erheblich",
  "gravierend",
] as const

/**
 * Lifecycle. `geprueft` and `verworfen` are terminal; `verworfen` can be
 * re-opened, which is why it is not a delete.
 */
export type ConstructionDefectStatus =
  | "offen"
  | "in_bearbeitung"
  | "erledigt"
  | "geprueft"
  | "verworfen"

export const CONSTRUCTION_DEFECT_STATUSES: readonly ConstructionDefectStatus[] = [
  "offen",
  "in_bearbeitung",
  "erledigt",
  "geprueft",
  "verworfen",
] as const

/** Immutable event kinds written by the transition RPC. */
export type ConstructionDefectEventType =
  | "angelegt"
  | "in_arbeit_genommen"
  | "fertiggemeldet"
  | "geprueft"
  | "zurueckgewiesen"
  | "verworfen"
  | "wieder_aufgenommen"

export const CONSTRUCTION_DEFECT_EVENT_TYPES: readonly ConstructionDefectEventType[] = [
  "angelegt",
  "in_arbeit_genommen",
  "fertiggemeldet",
  "geprueft",
  "zurueckgewiesen",
  "verworfen",
  "wieder_aufgenommen",
] as const

/**
 * The verbs accepted by `transition_construction_defect_status`. Note that the
 * action vocabulary is NOT the event vocabulary: the DB maps action → event, so
 * `pruefen` produces the event `geprueft`.
 */
export type ConstructionDefectAction =
  | "in_arbeit"
  | "fertigmelden"
  | "pruefen"
  | "zurueckweisen"
  | "verwerfen"
  | "wieder_aufnehmen"

export const CONSTRUCTION_DEFECT_ACTIONS: readonly ConstructionDefectAction[] = [
  "in_arbeit",
  "fertigmelden",
  "pruefen",
  "zurueckweisen",
  "verwerfen",
  "wieder_aufnehmen",
] as const

/** Actions the database refuses without a reason (AC-45β.8 / AC-45β.11). */
export const CONSTRUCTION_DEFECT_REASON_REQUIRED_ACTIONS: readonly ConstructionDefectAction[] = [
  "zurueckweisen",
  "verwerfen",
] as const

/** Trade shape as joined by the list SELECT — catalog label read, never stored. */
export interface ConstructionDefectTradeRef {
  id: string
  trade_id: string
  trade?: { id: string; key: string; label: string } | null
}

/** Section shape as joined by the list SELECT. */
export interface ConstructionDefectSectionRef {
  id: string
  label: string
  path: string | null
}

/** Subcontractor shape as joined by the list SELECT. */
export interface ConstructionDefectVendorRef {
  id: string
  name: string
}

export interface ConstructionDefect {
  id: string
  tenant_id: string
  project_id: string
  /** Sequential per project, so a defect notice is unambiguously citable. */
  defect_number: number
  title: string
  description: string | null
  /** Mandatory (lock L13): the trade carries responsibility. */
  trade_id: string
  /** Optional (lock L13): on a site walk the location is often still vague. */
  section_id: string | null
  severity: ConstructionDefectSeverity
  status: ConstructionDefectStatus
  due_date: string | null
  responsible_user_id: string | null
  /**
   * The defect's OWN subcontractor bond, not the trade assignment's: warranty
   * law cares who executed AT THE TIME OF THE DEFECT, so a derived value would
   * silently rewrite old defect notices when the assignment changes.
   */
  vendor_id: string | null
  /** Carrier of the four-eyes gate: whoever last reported completion. */
  reported_done_by: string | null
  reported_done_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  trade?: ConstructionDefectTradeRef | null
  section?: ConstructionDefectSectionRef | null
  vendor?: ConstructionDefectVendorRef | null
}

/** One immutable row of the defect's history (append-only, PROJ-105 pattern). */
export interface ConstructionDefectEvent {
  id: string
  tenant_id: string
  defect_id: string
  event_type: ConstructionDefectEventType
  status_before: ConstructionDefectStatus | null
  status_after: ConstructionDefectStatus
  reason: string | null
  actor_id: string | null
  created_at: string
}

/** Per-trade counters as produced by `construction_defect_summary`. */
export interface ConstructionDefectTradeSummary {
  project_trade_id: string
  trade_label: string | null
  total: number
  overdue: number
  awaiting_review: number
}

/**
 * Shape of `construction_defect_summary`. The RPC is SECURITY INVOKER, so these
 * counters are computed under the caller's own RLS — a member who cannot see a
 * defect cannot infer it from the totals either (AC-45βH-1).
 */
export interface ConstructionDefectSummary {
  project_id: string
  totals: {
    total: number
    open: number
    in_progress: number
    awaiting_review: number
    reviewed: number
    dismissed: number
    overdue: number
  }
  by_trade: ConstructionDefectTradeSummary[]
}

// PROJ-Y-45f: `ConstructionSectionBlockingDefect` ist mit
// `construction_section_blocking_defects(uuid)` gezogen. γ hat die Auskunft auf
// `construction_section_blocking_refs` verallgemeinert (Art + Bezeichnung,
// Mangel UND Abnahme); der Typ dafuer heisst `ConstructionBlockingRef` und
// liegt bei den Bau-Referenzen. Der Typ hier hatte 0 Verwender.
