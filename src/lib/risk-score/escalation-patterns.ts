/**
 * PROJ-35 Phase 35-α — Eskalations-Pattern-Detector (TS).
 *
 * Mirror der PL/pgSQL-Function `compute_escalation_patterns`. Both
 * implementations MUST stay in sync — there's a parity-test in
 * escalation-patterns.test.ts that exercises canonical fixtures.
 *
 * The DB-trigger (`audit_escalation_patterns`) is the source of truth
 * for the audit-trail; this TS module is the read-side helper used by
 * UI components that need to know "which patterns are currently active"
 * without round-tripping the snapshot column.
 */

import type {
  Attitude,
  ConflictPotential,
  DecisionAuthority,
  Influence,
} from "./defaults"

export type EscalationPatternKey =
  | "blocker_decider"
  | "amplified_conflict"
  | "dark_profile"
  | "unknown_critical"

export interface EscalationPatternInput {
  attitude: Attitude | null
  conflict_potential: ConflictPotential | null
  decision_authority: DecisionAuthority | null
  influence: Influence | null
  agreeableness_fremd: number | null
  emotional_stability_fremd: number | null
}

interface PatternMeta {
  key: EscalationPatternKey
  /** 1..5; ≥4 ⇒ destructive UI variant. */
  severity: number
  /** PM-facing recommendation rendered in the banner body. */
  recommendation: string
  /** Short label rendered in the dashboard "Top Pattern" column. */
  label: string
}

export const ESCALATION_PATTERN_META: Readonly<
  Record<EscalationPatternKey, PatternMeta>
> = Object.freeze({
  blocker_decider: {
    key: "blocker_decider",
    severity: 5,
    label: "Blockierender Entscheider",
    recommendation:
      "Dieser Stakeholder kann das Projekt blockieren. Eskalation in Steering empfohlen — 1:1-Gespräch vor Group-Setting.",
  },
  amplified_conflict: {
    key: "amplified_conflict",
    severity: 4,
    label: "Verstärktes Konflikt-Potenzial",
    recommendation:
      "Hohes Konflikt-Potenzial bei großer Reichweite. Frühzeitig Konfliktklärung suchen, Mediation erwägen.",
  },
  dark_profile: {
    key: "dark_profile",
    severity: 4,
    label: "Schwierige Persönlichkeits-Konstellation",
    recommendation:
      "Niedrige Verträglichkeit + niedrige emotionale Stabilität + kritisch gegenüber Projekt. Druck reduzieren, sachlich-vorsichtig kommunizieren.",
  },
  unknown_critical: {
    key: "unknown_critical",
    severity: 3,
    label: "Unbewertet, aber kritisch",
    recommendation:
      "Stakeholder ist kritisch für das Projekt aber noch nicht qualitativ bewertet. Bewertung durchführen für saubere Risiko-Sicht.",
  },
})

export function detectEscalationPatterns(
  input: EscalationPatternInput,
): EscalationPatternKey[] {
  const out: EscalationPatternKey[] = []

  if (input.attitude === "blocking" && input.decision_authority === "deciding") {
    out.push("blocker_decider")
  }
  if (
    input.conflict_potential === "critical" &&
    (input.influence === "high" || input.influence === "critical")
  ) {
    out.push("amplified_conflict")
  }
  if (
    input.agreeableness_fremd !== null &&
    input.emotional_stability_fremd !== null &&
    input.agreeableness_fremd < 30 &&
    input.emotional_stability_fremd < 30 &&
    (input.attitude === "critical" || input.attitude === "blocking")
  ) {
    out.push("dark_profile")
  }
  if (input.attitude === null && input.influence === "critical") {
    out.push("unknown_critical")
  }

  return out
}
