/**
 * PROJ-107 — canonical risk severity buckets.
 *
 * Single source of truth mirroring the DB helper `public._risk_severity_bucket`
 * (score = probability × impact, range 1–25):
 *   score <= 6  → low
 *   score <= 12 → medium
 *   score <= 19 → high
 *   else        → critical
 *
 * Before PROJ-107 three divergent thresholds existed in the UI (risk-table
 * >=16/9/4, risk-matrix >=16/9/4, risk-proposal >=15). All now map score→bucket
 * here and only pick a tint from the bucket — they never re-classify a score.
 */

export type RiskSeverity = "low" | "medium" | "high" | "critical"

export function riskSeverityBucket(score: number): RiskSeverity {
  if (score <= 6) return "low"
  if (score <= 12) return "medium"
  if (score <= 19) return "high"
  return "critical"
}

export const RISK_SEVERITY_LABELS: Record<RiskSeverity, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  critical: "Kritisch",
}

/** Badge tint (background + text) for a score chip. */
export function riskSeverityBadgeTone(score: number): string {
  switch (riskSeverityBucket(score)) {
    case "critical":
      return "bg-destructive/15 text-destructive"
    case "high":
      return "bg-warning/15 text-warning"
    case "medium":
      return "bg-info/15 text-info"
    default:
      return "bg-muted text-muted-foreground"
  }
}

/** Cell tint (background only) for the 5×5 heatmap. */
export function riskSeverityCellTone(score: number): string {
  switch (riskSeverityBucket(score)) {
    case "critical":
      return "bg-destructive/10"
    case "high":
      return "bg-warning/10"
    case "medium":
      return "bg-info/10"
    default:
      return "bg-muted/40"
  }
}
