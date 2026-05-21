/**
 * PROJ-65 ε.2 — cost-delta + rate formatter (FE-7, FE-8).
 *
 * Pure functions: rendering depends only on the server-provided
 * shape. UI never masks itself — the server decides which fields
 * arrive in plaintext and which in aggregate form.
 */

export type CostDelta =
  | { kind: "exact"; amount_cents: number; currency: string }
  | {
      kind: "aggregate"
      bucket: "much-less" | "less" | "even" | "more" | "much-more"
    }
  | { kind: "none" }

export function formatCostDelta(delta: CostDelta): string {
  switch (delta.kind) {
    case "exact": {
      const value = (delta.amount_cents / 100).toLocaleString("de-DE", {
        maximumFractionDigits: 0,
      })
      const prefix = delta.amount_cents > 0 ? "+" : ""
      return `${prefix}${value} ${delta.currency}`
    }
    case "aggregate": {
      switch (delta.bucket) {
        case "much-less":
          return "− deutlich geringerer Aufwand *"
        case "less":
          return "− geringerer Aufwand *"
        case "even":
          return "≈ *"
        case "more":
          return "+ höherer Aufwand *"
        case "much-more":
          return "+ deutlich höherer Aufwand *"
      }
      break
    }
    case "none":
      return "—"
  }
}

export function formatTimeDelta(days: number | null): string {
  if (days == null) return "—"
  if (days === 0) return "≈"
  const prefix = days > 0 ? "+" : ""
  const unit = Math.abs(days) === 1 ? "Tag" : "Tage"
  return `${prefix}${days} ${unit}`
}

export type RiskDelta =
  | { kind: "named"; from: string; to: string }
  | { kind: "even" }
  | { kind: "unknown" }

export function formatRiskDelta(delta: RiskDelta): string {
  switch (delta.kind) {
    case "named":
      return `${delta.from} → ${delta.to}`
    case "even":
      return "≈"
    case "unknown":
      return "—"
  }
}

export interface RateValue {
  kind: "exact" | "masked"
  amount_cents?: number
  currency?: string
  /** Optional per-tenant unit hint, e.g. "PT" or "h". Defaults to "PT". */
  unit?: string
}

export function formatRate(rate: RateValue | null): string {
  if (rate == null) return "—"
  if (rate.kind === "exact" && rate.amount_cents != null && rate.currency) {
    const value = (rate.amount_cents / 100).toLocaleString("de-DE", {
      maximumFractionDigits: 0,
    })
    return `${value} ${rate.currency}/${rate.unit ?? "PT"}`
  }
  return `1.x XX €/${rate.unit ?? "PT"} *`
}
