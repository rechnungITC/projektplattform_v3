/**
 * PROJ-36 Phase 36-γ — Hybrid roll-up display helpers.
 *
 * Tree-View columns show both the item's *own* values (planned_start,
 * planned_end, estimate_hours from `attributes`) AND the *derived*
 * values rolled up from descendants. Rules per spec § C:
 *
 *   - Effort is additive:
 *       displayed_total = (own ?? 0) + (derived ?? 0)
 *   - Dates are NOT additive — show both sides side-by-side, no aggregation.
 *
 * Auto-WBS-Code reset semantics + custom-flag are surfaced via small
 * pure helpers that the dialog and the tree row both use.
 */

import type { WorkItem } from "@/types/work-item"

/** Format regex — must match the DB CHECK and the API PATCH schema. */
export const WBS_CODE_REGEX = /^[A-Za-z0-9._-]{1,50}$/

export function isValidWbsCode(value: string): boolean {
  return WBS_CODE_REGEX.test(value)
}

/**
 * Read the item's own planned_start (string ISO date or null) from its
 * `attributes` JSONB blob. The cost-driver convention used elsewhere in
 * the codebase keeps these inside `attributes` (mirror PROJ-24 +
 * outline_path trigger reads `attributes->>'planned_start'`).
 */
export function ownPlannedStart(item: WorkItem): string | null {
  const v = (item.attributes as { planned_start?: unknown } | null)
    ?.planned_start
  return typeof v === "string" && v.length > 0 ? v : null
}

export function ownPlannedEnd(item: WorkItem): string | null {
  const v = (item.attributes as { planned_end?: unknown } | null)?.planned_end
  return typeof v === "string" && v.length > 0 ? v : null
}

export function ownEstimateHours(item: WorkItem): number | null {
  const v = (item.attributes as { estimate_hours?: unknown } | null)
    ?.estimate_hours
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v !== "") {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * Hybrid effort display — sums own + derived per OpenProject pattern.
 * `null` if both sides are null.
 */
export function totalEffort(
  own: number | null | undefined,
  derived: number | null | undefined
): number | null {
  const o = typeof own === "number" && Number.isFinite(own) ? own : null
  const d =
    typeof derived === "number" && Number.isFinite(derived) ? derived : null
  if (o == null && d == null) return null
  return (o ?? 0) + (d ?? 0)
}

/**
 * Tree-View depth — number of segments in `outline_path` (e.g. "1.2.3" → 3).
 * Returns 0 when the path is null/empty (e.g. legacy items not yet backfilled).
 */
export function outlinePathDepth(path: string | null | undefined): number {
  if (!path || typeof path !== "string") return 0
  return path.split(".").filter((s) => s.length > 0).length
}

/** Format hours for inline display, German locale. */
export function formatHours(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return `${value.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })} h`
}

/** Format an ISO date for inline display ("dd.MM.yy"). */
export function formatDateShort(value: string | null | undefined): string {
  if (!value) return "—"
  // Defensive parse — accept ISO YYYY-MM-DD, fallback raw if unparseable.
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  })
}
