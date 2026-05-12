/**
 * PROJ-35 Phase 35-α — Risk-Score-Compute (pure function).
 *
 * Formula:
 *   risk =
 *       influence_weight   × influence_norm(0..1)
 *     × impact_weight      × impact_norm(0..1)
 *     × attitude_factor
 *     × conflict_factor
 *     × big5_modifier  (1 - agreeableness/100 × adversity_weight)
 *     × authority_factor
 *
 * Output is clamped to 0..10 for downstream bucket-mapping. Sub-millisecond
 * cost; safe to call per render. Consumers should call `mergeRiskScoreConfig`
 * once per request to materialize the effective config, then pass it here
 * along with the stakeholder + Big5-fremd-row.
 */

import {
  riskBucket,
  type Attitude,
  type ConflictPotential,
  type DecisionAuthority,
  type Impact,
  type Influence,
  type RiskBucket,
  type RiskScoreConfig,
} from "./defaults"

export interface RiskScoreInput {
  influence: Influence | null
  impact: Impact | null
  attitude: Attitude | null
  conflict_potential: ConflictPotential | null
  decision_authority: DecisionAuthority | null
  /** Big5-fremd value 0..100 or null. Null → big5_modifier = 1.0. */
  agreeableness_fremd: number | null
  /**
   * PROJ-34-ζ — communication-history signal in the range -1..+1.
   * -1 = very negative (obstructive, repeatedly overdue), 0 = neutral,
   * +1 = very positive (collaborative, responsive). Null means the
   * signal is unknown and the multiplier defaults to 1.0.
   */
  communication_signal?: number | null
}

export interface RiskScoreBreakdown {
  score: number
  bucket: RiskBucket
  factors: {
    influence_norm: number
    impact_norm: number
    attitude_factor: number
    conflict_factor: number
    authority_factor: number
    big5_modifier: number
    /** PROJ-34-ζ — 1.0 when weight is 0 (opt-in default) or input is null. */
    communication_modifier: number
  }
  /** True iff the agreeableness input was null and big5_modifier defaulted. */
  big5_missing: boolean
  /** True iff the communication_signal was null or weight was 0. */
  communication_missing: boolean
}

const SCORE_MAX = 10

/**
 * Pure function. Identical input + identical config → identical score.
 */
export function computeRiskScore(
  input: RiskScoreInput,
  config: RiskScoreConfig,
): RiskScoreBreakdown {
  const inf = input.influence
  const imp = input.impact
  const att = input.attitude
  const cnf = input.conflict_potential
  const auth = input.decision_authority

  const influence_norm = inf ? config.influence_norm[inf] : 0
  const impact_norm = imp ? config.impact_norm[imp] : 0
  const attitude_factor = att ? config.attitude_factor[att] : config.attitude_factor.neutral
  const conflict_factor = cnf ? config.conflict_factor[cnf] : config.conflict_factor.medium
  const authority_factor = auth
    ? config.authority_factor[auth]
    : config.authority_factor.none

  const big5_missing = input.agreeableness_fremd === null
  const big5_modifier = big5_missing
    ? 1.0
    : 1 - (input.agreeableness_fremd! / 100) * config.adversity_weight

  // PROJ-34-ζ — Communication-signal modifier. Positive signal lowers
  // risk, negative signal raises it. Range: (1 - weight) .. (1 + weight).
  // With default weight = 0 this is a no-op multiplier of 1.0 (CIA-L4).
  const communication_missing =
    input.communication_signal == null || config.communication_weight === 0
  const communication_modifier = communication_missing
    ? 1.0
    : 1 - (input.communication_signal as number) * config.communication_weight

  const raw =
    config.influence_weight *
    influence_norm *
    config.impact_weight *
    impact_norm *
    attitude_factor *
    conflict_factor *
    big5_modifier *
    authority_factor *
    communication_modifier

  const clamped = Math.max(0, Math.min(SCORE_MAX, raw))
  const rounded = Math.round(clamped * 100) / 100 // 2 decimals for UI

  return {
    score: rounded,
    bucket: riskBucket(rounded),
    factors: {
      influence_norm,
      impact_norm,
      attitude_factor,
      conflict_factor,
      authority_factor,
      big5_modifier: Math.round(big5_modifier * 100) / 100,
      communication_modifier: Math.round(communication_modifier * 100) / 100,
    },
    big5_missing,
    communication_missing,
  }
}
