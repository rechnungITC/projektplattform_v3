/**
 * PROJ-35 Phase 35-α — Wahrnehmungslücke (Perception Gap).
 *
 * CIA-Fork-3 lock: zwei separate Aggregate (Skill + Big5) mit
 * Mindest-Coverage-Threshold von 60 % der Dimensionen pro Aggregat.
 * Hardcoded threshold (siehe Spec OF-2).
 *
 * "Coverage" = Anzahl Dimensionen, in denen sowohl fremd als auch self
 * gesetzt sind, geteilt durch 5.
 *
 * Output: pro Aggregat
 *   - status: 'no_self' (kein Self-Wert vorhanden)
 *           | 'low_coverage' (Self-Werte vorhanden, aber < 60 %)
 *           | 'computed' (≥ 60 % → Aggregat berechnet)
 *   - max_delta: max |fremd - self| über die Dimensionen mit beiden Werten
 *   - flagged: max_delta ≥ 30
 *   - dimensions: pro Dimension {label, fremd, self, delta} sortiert
 *                 nach |delta| DESC; nur die mit beiden Werten
 */

import {
  PERSONALITY_DIMENSION_LABELS,
  PERSONALITY_DIMENSIONS,
  SKILL_DIMENSION_LABELS,
  SKILL_DIMENSIONS,
  type PersonalityDimension,
  type SkillDimension,
  type StakeholderPersonalityProfile,
  type StakeholderSkillProfile,
} from "@/types/stakeholder-profile"

export const COVERAGE_THRESHOLD = 0.6
export const FLAG_DELTA_THRESHOLD = 30

export type PerceptionGapStatus = "no_self" | "low_coverage" | "computed"

export interface PerceptionGapDimension<T extends string> {
  dimension: T
  label: string
  fremd: number
  self: number
  delta: number
}

export interface PerceptionGapAggregate<T extends string> {
  status: PerceptionGapStatus
  coverage: number
  max_delta: number
  flagged: boolean
  dimensions: Array<PerceptionGapDimension<T>>
}

function aggregate<T extends string>(
  pairs: Array<{ dimension: T; label: string; fremd: number | null; self: number | null }>,
): PerceptionGapAggregate<T> {
  const total = pairs.length
  const withSelf = pairs.filter((p) => p.self !== null).length

  // No self values at all → "no_self" — UI shows "ausstehend".
  if (withSelf === 0) {
    return {
      status: "no_self",
      coverage: 0,
      max_delta: 0,
      flagged: false,
      dimensions: [],
    }
  }

  // Compute deltas only for pairs where BOTH values are present.
  const both = pairs.filter(
    (p) => p.fremd !== null && p.self !== null,
  ) as Array<{ dimension: T; label: string; fremd: number; self: number }>

  const coverage = both.length / total

  if (coverage < COVERAGE_THRESHOLD) {
    return {
      status: "low_coverage",
      coverage,
      max_delta: 0,
      flagged: false,
      dimensions: [],
    }
  }

  const dimensions = both
    .map((p) => ({
      dimension: p.dimension,
      label: p.label,
      fremd: p.fremd,
      self: p.self,
      delta: p.self - p.fremd,
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  const max_delta = dimensions.length > 0 ? Math.abs(dimensions[0]!.delta) : 0
  const flagged = max_delta >= FLAG_DELTA_THRESHOLD

  return {
    status: "computed",
    coverage,
    max_delta,
    flagged,
    dimensions,
  }
}

export function computeSkillGap(
  profile: StakeholderSkillProfile | null,
): PerceptionGapAggregate<SkillDimension> {
  if (!profile) {
    return {
      status: "no_self",
      coverage: 0,
      max_delta: 0,
      flagged: false,
      dimensions: [],
    }
  }
  const pairs = SKILL_DIMENSIONS.map((d) => ({
    dimension: d,
    label: SKILL_DIMENSION_LABELS[d],
    fremd: profile[`${d}_fremd`],
    self: profile[`${d}_self`],
  }))
  return aggregate(pairs)
}

export function computeBig5Gap(
  profile: StakeholderPersonalityProfile | null,
): PerceptionGapAggregate<PersonalityDimension> {
  if (!profile) {
    return {
      status: "no_self",
      coverage: 0,
      max_delta: 0,
      flagged: false,
      dimensions: [],
    }
  }
  const pairs = PERSONALITY_DIMENSIONS.map((d) => ({
    dimension: d,
    label: PERSONALITY_DIMENSION_LABELS[d],
    fremd: profile[`${d}_fremd`],
    self: profile[`${d}_self`],
  }))
  return aggregate(pairs)
}
