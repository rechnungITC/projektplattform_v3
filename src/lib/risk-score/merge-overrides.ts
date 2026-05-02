/**
 * PROJ-35 Phase 35-α — Merge tenant overrides on top of defaults.
 *
 * The tenant-admin UI persists partial overrides as JSONB in
 * `tenant_settings.risk_score_overrides`. This helper produces the
 * effective config used by `computeRiskScore`.
 *
 * Defense-in-depth: any field that fails Zod validation at write-time
 * cannot land in the DB; but if the JSON happens to drift (e.g. legacy
 * row, manual SQL), the merge falls back to defaults per-key — never
 * crashes, never produces a partial config.
 */

import { z } from "zod"

import {
  RISK_SCORE_DEFAULTS,
  type AttitudeFactor,
  type AuthorityFactor,
  type ConflictFactor,
  type InfluenceImpactNorm,
  type RiskScoreConfig,
} from "./defaults"

const numericGuard = z.number().finite().min(0).max(10)

const influenceImpactNormSchema = z
  .object({
    low: numericGuard.optional(),
    medium: numericGuard.optional(),
    high: numericGuard.optional(),
    critical: numericGuard.optional(),
  })
  .optional()

const attitudeFactorSchema = z
  .object({
    supportive: numericGuard.optional(),
    neutral: numericGuard.optional(),
    critical: numericGuard.optional(),
    blocking: numericGuard.optional(),
  })
  .optional()

const conflictFactorSchema = z
  .object({
    low: numericGuard.optional(),
    medium: numericGuard.optional(),
    high: numericGuard.optional(),
    critical: numericGuard.optional(),
  })
  .optional()

const authorityFactorSchema = z
  .object({
    none: numericGuard.optional(),
    advisory: numericGuard.optional(),
    recommending: numericGuard.optional(),
    deciding: numericGuard.optional(),
  })
  .optional()

export const riskScoreOverridesSchema = z.object({
  influence_weight: numericGuard.optional(),
  impact_weight: numericGuard.optional(),
  influence_norm: influenceImpactNormSchema,
  impact_norm: influenceImpactNormSchema,
  attitude_factor: attitudeFactorSchema,
  conflict_factor: conflictFactorSchema,
  authority_factor: authorityFactorSchema,
  adversity_weight: numericGuard.optional(),
})

export type RiskScoreOverrides = z.infer<typeof riskScoreOverridesSchema>

function mergeNumericBucket<K extends string>(
  defaults: Readonly<Record<K, number>>,
  overrides: Partial<Record<K, number>> | undefined,
): Record<K, number> {
  const out = { ...defaults } as Record<K, number>
  if (!overrides) return out
  for (const key of Object.keys(defaults) as Array<K>) {
    const v = overrides[key]
    if (typeof v === "number" && Number.isFinite(v)) {
      out[key] = v
    }
  }
  return out
}

/**
 * Returns the effective config = defaults ∪ overrides (key-wise).
 *
 * Unknown override fields are silently ignored. Invalid types (NaN,
 * non-number, out-of-range) fall back to default for that key — defense
 * in depth against DB drift.
 */
export function mergeRiskScoreConfig(
  overrides: unknown,
): RiskScoreConfig {
  const parsed = riskScoreOverridesSchema.safeParse(overrides)
  const o: RiskScoreOverrides = parsed.success ? parsed.data : {}

  const d = RISK_SCORE_DEFAULTS

  return {
    influence_weight:
      typeof o.influence_weight === "number" && Number.isFinite(o.influence_weight)
        ? o.influence_weight
        : d.influence_weight,
    impact_weight:
      typeof o.impact_weight === "number" && Number.isFinite(o.impact_weight)
        ? o.impact_weight
        : d.impact_weight,
    influence_norm: mergeNumericBucket(
      d.influence_norm,
      o.influence_norm,
    ) as InfluenceImpactNorm,
    impact_norm: mergeNumericBucket(
      d.impact_norm,
      o.impact_norm,
    ) as InfluenceImpactNorm,
    attitude_factor: mergeNumericBucket(
      d.attitude_factor,
      o.attitude_factor,
    ) as AttitudeFactor,
    conflict_factor: mergeNumericBucket(
      d.conflict_factor,
      o.conflict_factor,
    ) as ConflictFactor,
    authority_factor: mergeNumericBucket(
      d.authority_factor,
      o.authority_factor,
    ) as AuthorityFactor,
    adversity_weight:
      typeof o.adversity_weight === "number" && Number.isFinite(o.adversity_weight)
        ? o.adversity_weight
        : d.adversity_weight,
  }
}
