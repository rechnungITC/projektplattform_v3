/**
 * PROJ-34-γ.2 — Aggregate per-participant signals to interaction-level summary.
 *
 * Designer-Decision D5 (docs/design/proj-34-gamma2-ai-review.md):
 *   - Median, not Mean (Mean lies on bimodal "2-koop + 2-obstr" meetings).
 *   - Spread flag when `max - min >= 3` so minority signal stays visible.
 *
 * Returns `null` for an empty input or when all values are null. Used by
 * stakeholder list summary cards and the existing focusedParticipant logic
 * in communication-tab.
 */

export type SignalAggregate = {
  median: number
  spread: number
  count: number
  hasSpread: boolean
}

export function aggregateInteractionSignal(
  values: ReadonlyArray<number | null | undefined>,
): SignalAggregate | null {
  const numbers = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  )
  if (numbers.length === 0) return null

  const sorted = [...numbers].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!

  const spread = sorted[sorted.length - 1]! - sorted[0]!

  return {
    median,
    spread,
    count: numbers.length,
    hasSpread: spread >= 3,
  }
}