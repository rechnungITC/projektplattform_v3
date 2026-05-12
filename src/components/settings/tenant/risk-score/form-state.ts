/**
 * PROJ-35 Phase 35-α — shared form-state types & helpers.
 *
 * Lives outside the form component so the page-client can own the state
 * and the live-preview can read the same effective config without going
 * through a save round-trip (Bug-3 fix).
 */

import type {
  RiskScoreConfig,
} from "@/lib/risk-score/defaults"
import type {
  RiskScoreOverrides,
} from "@/lib/risk-score/merge-overrides"

import type { RiskScoreSettings } from "@/lib/risk-score/api"

export type BucketKey =
  | "attitude_factor"
  | "conflict_factor"
  | "authority_factor"
  | "influence_norm"
  | "impact_norm"

export type ScalarKey = "influence_weight" | "impact_weight" | "adversity_weight"

export type FormState = Record<ScalarKey, string> &
  Record<BucketKey, Record<string, string>>

export const SCALAR_KEYS: ScalarKey[] = [
  "influence_weight",
  "impact_weight",
  "adversity_weight",
]

export const BUCKET_KEYS: BucketKey[] = [
  "attitude_factor",
  "conflict_factor",
  "authority_factor",
  "influence_norm",
  "impact_norm",
]

const BUCKET_FIELDS: Record<BucketKey, readonly string[]> = {
  attitude_factor: ["supportive", "neutral", "critical", "blocking"],
  conflict_factor: ["low", "medium", "high", "critical"],
  authority_factor: ["none", "advisory", "recommending", "deciding"],
  influence_norm: ["low", "medium", "high", "critical"],
  impact_norm: ["low", "medium", "high", "critical"],
}

export function bucketFields(key: BucketKey): readonly string[] {
  return BUCKET_FIELDS[key]
}

function bucketToForm(
  bucket: Partial<Record<string, number>> | undefined,
  fields: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of fields) {
    const v = bucket?.[f]
    out[f] = typeof v === "number" ? String(v) : ""
  }
  return out
}

export function buildInitialFormState(s: RiskScoreSettings): FormState {
  const o = s.overrides
  const out: FormState = {
    influence_weight:
      typeof o.influence_weight === "number" ? String(o.influence_weight) : "",
    impact_weight:
      typeof o.impact_weight === "number" ? String(o.impact_weight) : "",
    adversity_weight:
      typeof o.adversity_weight === "number" ? String(o.adversity_weight) : "",
    attitude_factor: bucketToForm(o.attitude_factor, BUCKET_FIELDS.attitude_factor),
    conflict_factor: bucketToForm(o.conflict_factor, BUCKET_FIELDS.conflict_factor),
    authority_factor: bucketToForm(
      o.authority_factor,
      BUCKET_FIELDS.authority_factor,
    ),
    influence_norm: bucketToForm(o.influence_norm, BUCKET_FIELDS.influence_norm),
    impact_norm: bucketToForm(o.impact_norm, BUCKET_FIELDS.impact_norm),
  }
  return out
}

function parseScalar(s: string): number | undefined {
  const t = s.trim()
  if (t === "") return undefined
  const n = Number(t)
  if (!Number.isFinite(n)) return undefined
  return n
}

function parseBucket(
  raw: Record<string, string>,
): Record<string, number> | undefined {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw)) {
    const n = parseScalar(v)
    if (n !== undefined) out[k] = n
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function formStateToOverrides(state: FormState): RiskScoreOverrides {
  const out: RiskScoreOverrides = {}
  const inf = parseScalar(state.influence_weight)
  if (inf !== undefined) out.influence_weight = inf
  const imp = parseScalar(state.impact_weight)
  if (imp !== undefined) out.impact_weight = imp
  const adv = parseScalar(state.adversity_weight)
  if (adv !== undefined) out.adversity_weight = adv

  const att = parseBucket(state.attitude_factor)
  if (att) out.attitude_factor = att as RiskScoreOverrides["attitude_factor"]
  const cnf = parseBucket(state.conflict_factor)
  if (cnf) out.conflict_factor = cnf as RiskScoreOverrides["conflict_factor"]
  const auth = parseBucket(state.authority_factor)
  if (auth) out.authority_factor = auth as RiskScoreOverrides["authority_factor"]
  const infN = parseBucket(state.influence_norm)
  if (infN) out.influence_norm = infN as RiskScoreOverrides["influence_norm"]
  const impN = parseBucket(state.impact_norm)
  if (impN) out.impact_norm = impN as RiskScoreOverrides["impact_norm"]

  return out
}

/**
 * Local, no-network mirror of `mergeRiskScoreConfig`. Per-key fallback to
 * defaults wherever the override is missing or non-numeric.
 */
export function mergeFormPreview(
  defaults: RiskScoreConfig,
  overrides: RiskScoreOverrides,
): RiskScoreConfig {
  return {
    influence_weight:
      typeof overrides.influence_weight === "number"
        ? overrides.influence_weight
        : defaults.influence_weight,
    impact_weight:
      typeof overrides.impact_weight === "number"
        ? overrides.impact_weight
        : defaults.impact_weight,
    influence_norm: { ...defaults.influence_norm, ...overrides.influence_norm },
    impact_norm: { ...defaults.impact_norm, ...overrides.impact_norm },
    attitude_factor: {
      ...defaults.attitude_factor,
      ...overrides.attitude_factor,
    },
    conflict_factor: {
      ...defaults.conflict_factor,
      ...overrides.conflict_factor,
    },
    authority_factor: {
      ...defaults.authority_factor,
      ...overrides.authority_factor,
    },
    adversity_weight:
      typeof overrides.adversity_weight === "number"
        ? overrides.adversity_weight
        : defaults.adversity_weight,
    communication_weight:
      typeof overrides.communication_weight === "number"
        ? overrides.communication_weight
        : defaults.communication_weight,
  }
}
