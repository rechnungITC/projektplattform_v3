// PROJ-45-δ — Bauspezifische Terminsignale.
//
// Spiegelt die Rückgabe der Auswertung `construction_schedule_signals(uuid)`
// (SECURITY INVOKER, ein Zeitbezug für alle vier Blöcke — D-δ1).
// Diese Datei ist die einzige TypeScript-Wahrheit für die Form; Routen, Client-Wrapper
// und Oberfläche leiten davon ab.

import type { ConstructionRagStatus } from "@/types/construction"

/** Gründe, aus denen ein Gewerk als blockiert gilt (L27, AC-45δ.3). */
export type ConstructionBlockerReason =
  | "overdue_defects"
  | "acceptance_refused"
  | "acceptance_overdue"
  | "reservations_open"

/** Quelle, aus der der Abschnittsfortschritt gerechnet wurde (L28, AC-45δ.9). */
export type ConstructionProgressSource = "work_items" | "phases"

/** Art eines Termins in „Nächste Fristen" (AC-45δ.11). */
export type ConstructionDeadlineKind = "mangel" | "abnahme"

export interface ConstructionTradeSignal {
  project_trade_id: string
  trade_id: string
  trade_label: string
  /**
   * Die von α gesetzte manuelle Ampel — steht NEBEN dem gerechneten Signal (L26).
   * Bewusst der α-Typ, keine vierte Kopie derselben drei Werte.
   */
  manual_status: ConstructionRagStatus
  responsible_user_id: string | null
  is_blocked: boolean
  blocker_reasons: ConstructionBlockerReason[]
  /** Drei getrennte Zahlen, bewusst nicht addiert (AC-45δ.5). */
  overdue_defects: number
  defects_without_due_date: number
  defects_awaiting_review: number
  acceptances_refused: number
  acceptances_overdue_scheduled: number
  acceptances_with_open_reservations: number
}

export interface ConstructionSectionSignal {
  section_id: string
  parent_id: string | null
  label: string
  sort_order: number
  subtree_depth: number
  /** `null` heisst: nichts verknüpft — dann KEIN Fortschritt von 0 % zeigen (AC-45δ.10). */
  progress_source: ConstructionProgressSource | null
  /** Zahl der gezählten Vorgänge im Teilbaum inkl. dieses Abschnitts. */
  source_count: number
  /** Zahl der verknüpften Vorgänge inkl. verworfener — kann > `source_count` sein. */
  linked_count: number
  /** `null`, wenn nichts zählbar verknüpft ist. */
  progress_percent: number | null
  overdue_items: number
  /** Phasen werden auch dann genannt, wenn Arbeitspakete führen (Edge Case). */
  phase_linked_count: number
}

export interface ConstructionDeadlineEntry {
  kind: ConstructionDeadlineKind
  ref_id: string
  ref_number: number
  label: string
  due_on: string
  is_elapsed: boolean
  project_trade_id: string | null
  trade_label: string | null
  section_id: string | null
  section_label: string | null
}

export interface ConstructionOverdueDefectRow {
  defect_id: string
  ref_number: number
  title: string
  severity: string
  status: string
  due_date: string
  days_overdue: number
  project_trade_id: string
  trade_label: string | null
  section_id: string | null
  section_label: string | null
  responsible_user_id: string | null
}

export interface ConstructionSignalSummary {
  overdue_defects: number
  defects_without_due_date: number
  defects_awaiting_review: number
  blocked_trades: number
  trades_total: number
  sections_total: number
}

export interface ConstructionScheduleSignals {
  project_id: string
  /** Der EINE Zeitbezug der Auswertung (D-δ1). */
  as_of: string
  window_days: number
  summary: ConstructionSignalSummary
  trades: ConstructionTradeSignal[]
  sections: ConstructionSectionSignal[]
  deadlines: ConstructionDeadlineEntry[]
  overdue_defects: ConstructionOverdueDefectRow[]
}

/** Abschnitte der CSV-Ausgabe (D-δ7). */
export const CONSTRUCTION_SIGNAL_EXPORT_SECTIONS = [
  "trades",
  "sections",
  "deadlines",
  "overdue_defects",
] as const

export type ConstructionSignalExportSection =
  (typeof CONSTRUCTION_SIGNAL_EXPORT_SECTIONS)[number]
