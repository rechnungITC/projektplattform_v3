/**
 * PROJ-35 Phase 35-α — Risk-Score-Defaults.
 *
 * Hardcoded Multiplikator-Defaults. Tenant-Admin-Overrides liegen in
 * `tenant_settings.risk_score_overrides`; `mergeRiskScoreConfig`
 * (siehe merge-overrides.ts) liefert die effektiv angewendete Config.
 *
 * Begründung pro Wert: siehe `docs/decisions/risk-score-defaults.md`.
 *
 * Skala-Mapping (Score 0..10) → Bucket (siehe `riskBucket()` unten):
 *   < 1   → 'green'   keine Action
 *   1–3   → 'yellow'  beobachten
 *   3–6   → 'orange'  proaktiv ansprechen
 *   ≥ 6   → 'red'     Eskalation/Steering
 */

export type Influence = "low" | "medium" | "high" | "critical"
export type Impact = "low" | "medium" | "high" | "critical"
export type Attitude = "supportive" | "neutral" | "critical" | "blocking"
export type ConflictPotential = "low" | "medium" | "high" | "critical"
export type DecisionAuthority =
  | "none"
  | "advisory"
  | "recommending"
  | "deciding"

export type RiskBucket = "green" | "yellow" | "orange" | "red"

export interface InfluenceImpactNorm {
  low: number
  medium: number
  high: number
  critical: number
}

export interface AttitudeFactor {
  supportive: number
  neutral: number
  critical: number
  blocking: number
}

export interface ConflictFactor {
  low: number
  medium: number
  high: number
  critical: number
}

export interface AuthorityFactor {
  none: number
  advisory: number
  recommending: number
  deciding: number
}

export interface RiskScoreConfig {
  /** Weight on influence_norm — usually 1.0; can be amplified by tenant. */
  influence_weight: number
  /** Weight on impact_norm. */
  impact_weight: number
  /** Maps influence enum to 0..1 numeric. */
  influence_norm: InfluenceImpactNorm
  /** Maps impact enum to 0..1 numeric. */
  impact_norm: InfluenceImpactNorm
  /** Multiplier per attitude bucket. */
  attitude_factor: AttitudeFactor
  /** Multiplier per conflict-potential bucket. */
  conflict_factor: ConflictFactor
  /** Multiplier per decision-authority bucket. */
  authority_factor: AuthorityFactor
  /** Strength of low-agreeableness contribution to risk. Range 0..1. */
  adversity_weight: number
}

export const RISK_SCORE_DEFAULTS: Readonly<RiskScoreConfig> = Object.freeze({
  influence_weight: 1.0,
  impact_weight: 1.0,
  influence_norm: { low: 0.25, medium: 0.5, high: 0.75, critical: 1.0 },
  impact_norm: { low: 0.25, medium: 0.5, high: 0.75, critical: 1.0 },
  attitude_factor: {
    supportive: 0.5,
    neutral: 1.0,
    critical: 1.5,
    blocking: 2.5,
  },
  conflict_factor: { low: 0.5, medium: 1.0, high: 1.5, critical: 2.0 },
  authority_factor: {
    none: 0.5,
    advisory: 0.8,
    recommending: 1.0,
    deciding: 1.5,
  },
  adversity_weight: 0.3,
})

/**
 * Bucket boundaries for the score-to-color mapping.
 * UI uses these to colorize banners, badges, and dashboard rows.
 */
export const RISK_BUCKET_BOUNDARIES = Object.freeze({
  yellow: 1,
  orange: 3,
  red: 6,
} as const)

export function riskBucket(score: number): RiskBucket {
  if (score >= RISK_BUCKET_BOUNDARIES.red) return "red"
  if (score >= RISK_BUCKET_BOUNDARIES.orange) return "orange"
  if (score >= RISK_BUCKET_BOUNDARIES.yellow) return "yellow"
  return "green"
}
