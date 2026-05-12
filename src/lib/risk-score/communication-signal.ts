/**
 * PROJ-34-ζ — Communication-signal aggregator for the risk-score.
 *
 * Takes the per-participant sentiment + cooperation rows for one
 * stakeholder plus an overdue count, and returns a single number in
 * `[-1, +1]` that feeds `computeRiskScore`. The aggregation deliberately
 * stays simple (mean across the available signals) to match the lazy-on-
 * read posture of CIA-L5.
 *
 * Default behavior when no signals are present: returns `null`, which
 * tells `computeRiskScore` to use the neutral multiplier of 1.0.
 */

export interface CommunicationSignalRow {
  /** -2..+2 from the bridge column, or null when not yet rated. */
  participant_sentiment: number | null
  /** -2..+2 from the bridge column, or null when not yet rated. */
  participant_cooperation_signal: number | null
}

export interface CommunicationSignalInput {
  rows: CommunicationSignalRow[]
  /** Count of currently-overdue awaiting responses for this stakeholder. */
  overdue_count: number
}

/**
 * Returns the aggregated communication signal in `[-1, +1]`, or null
 * when there is not enough data. The formula is intentionally simple:
 *
 *   mean(sentiment_norm, cooperation_norm) − overdue_penalty
 *
 * - sentiment_norm = mean(sentiment_i / 2) for i with a value
 * - cooperation_norm = mean(cooperation_i / 2) for i with a value
 * - overdue_penalty = min(0.5, 0.1 * overdue_count) — clamped so a few
 *   overdue items don't pin the signal to the worst case alone.
 */
export function aggregateCommunicationSignal({
  rows,
  overdue_count,
}: CommunicationSignalInput): number | null {
  const sentiments = rows
    .map((r) => r.participant_sentiment)
    .filter((v): v is number => typeof v === "number")
  const cooperations = rows
    .map((r) => r.participant_cooperation_signal)
    .filter((v): v is number => typeof v === "number")

  // No signals at all and no overdue activity → no input.
  if (sentiments.length === 0 && cooperations.length === 0 && overdue_count === 0) {
    return null
  }

  const partials: number[] = []
  if (sentiments.length > 0) {
    partials.push(sentiments.reduce((s, n) => s + n, 0) / sentiments.length / 2)
  }
  if (cooperations.length > 0) {
    partials.push(
      cooperations.reduce((s, n) => s + n, 0) / cooperations.length / 2,
    )
  }

  const positiveBase = partials.length > 0
    ? partials.reduce((s, n) => s + n, 0) / partials.length
    : 0
  const overduePenalty = Math.min(0.5, overdue_count * 0.1)

  const raw = positiveBase - overduePenalty
  // Clamp to [-1, +1] — defensive against degenerate inputs.
  return Math.max(-1, Math.min(1, raw))
}
