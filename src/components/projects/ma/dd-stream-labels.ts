/**
 * PROJ-112 — shared German labels + small helpers for the DD-stream UI
 * (overview, detail, status transitions, template catalog).
 */

import type { DdStreamStatus } from "@/lib/ma-project/dd-streams-api"
import type { MaConfidentialityLevel } from "@/types/confidentiality"

export const DD_STATUS_LABEL: Record<DdStreamStatus, string> = {
  not_started: "Nicht gestartet",
  started: "Gestartet",
  in_review: "In Prüfung",
  findings_consolidated: "Findings konsolidiert",
  completed: "Abgeschlossen",
}

export const DD_LEVEL_LABEL: Record<MaConfidentialityLevel, string> = {
  standard: "Standard",
  confidential: "Vertraulich",
  strict: "Streng vertraulich",
}

export function ddStatusBadgeVariant(
  status: DdStreamStatus
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default"
  if (status === "not_started") return "outline"
  return "secondary" // started | in_review | findings_consolidated
}

/**
 * Allowed next states from the current status — mirrors the server-side
 * transition_dd_stream_status state machine (linear forward + one-step revert
 * + reopen). The UI offers exactly these; the RPC re-validates authoritatively.
 */
export function allowedDdTransitions(status: DdStreamStatus): DdStreamStatus[] {
  switch (status) {
    case "not_started":
      return ["started"]
    case "started":
      return ["in_review", "not_started"]
    case "in_review":
      return ["findings_consolidated", "started"]
    case "findings_consolidated":
      return ["completed", "in_review"]
    case "completed":
      return ["findings_consolidated"]
    default:
      return []
  }
}

/** de-DE short date, or em dash for null. */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-DE")
}

/**
 * "Restzeit" relative to planned_end, computed against `today` (caller passes a
 * stable today to keep it deterministic / SSR-safe). Returns a short German
 * phrase, or null when no planned_end is set.
 */
export function remainingTime(
  plannedEnd: string | null | undefined,
  today: Date
): { label: string; overdue: boolean } | null {
  if (!plannedEnd) return null
  const end = new Date(plannedEnd)
  if (Number.isNaN(end.getTime())) return null
  const ms = end.getTime() - today.getTime()
  const days = Math.round(ms / 86_400_000)
  if (days < 0) return { label: `${Math.abs(days)} Tage überfällig`, overdue: true }
  if (days === 0) return { label: "heute fällig", overdue: false }
  return { label: `noch ${days} Tage`, overdue: false }
}