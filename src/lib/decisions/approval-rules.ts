/**
 * PROJ-31 — method/phase-driven approval-gate rules.
 *
 * Returns whether a Decision created in a given (method, phase-status)
 * context should automatically require approval. The PM can always
 * override (manual flag), but this provides the default.
 *
 * Modeled as a TypeScript constant — consistent with the existing
 * PROJ-6 method catalog (also TS-only). Tenant-overrides can later be
 * layered on top via a DB table, but are out-of-scope for the MVP.
 */

import type { PhaseStatus } from "@/types/phase"
import type { ProjectMethod } from "@/types/project-method"

export interface DecisionApprovalRule {
  /** Default `requires_approval` for Decisions with this method+phase. */
  requires_approval: boolean
  /** Optional default quorum the UI can pre-select. */
  default_quorum?: number
}

const DEFAULT_RULE: DecisionApprovalRule = { requires_approval: false }

/**
 * Method-specific defaults. Pure data; no side-effects.
 *
 * Wasserfall: governance-heavy, formal phase gates → spec-phase Decisions
 * default to required.
 *
 * Scrum/Kanban/SAFe: agile, decisions are mostly operational; only
 * explicitly-flagged Decisions go through approval.
 */
const METHOD_RULES: Partial<
  Record<ProjectMethod, Partial<Record<PhaseStatus | "any", DecisionApprovalRule>>>
> = {
  waterfall: {
    in_progress: { requires_approval: true, default_quorum: 1 },
    planned: { requires_approval: true, default_quorum: 1 },
  },
  // Heavyweight methods — formal Decisions through gates by default.
  pmi: {
    in_progress: { requires_approval: true, default_quorum: 1 },
    planned: { requires_approval: true, default_quorum: 1 },
  },
  prince2: {
    in_progress: { requires_approval: true, default_quorum: 1 },
    planned: { requires_approval: true, default_quorum: 1 },
  },
  vxt2: {
    in_progress: { requires_approval: true, default_quorum: 1 },
    planned: { requires_approval: true, default_quorum: 1 },
  },
  // Agile methods — Decisions are mostly operational. PM can flag
  // explicitly when a steering-committee Decision is needed.
  scrum: {},
  kanban: {},
  safe: {},
}

export function resolveDecisionApprovalRule(
  method: ProjectMethod | null,
  phaseStatus: PhaseStatus | null,
): DecisionApprovalRule {
  if (!method) return DEFAULT_RULE
  const methodRules = METHOD_RULES[method]
  if (!methodRules) return DEFAULT_RULE
  if (phaseStatus && methodRules[phaseStatus]) {
    return methodRules[phaseStatus]!
  }
  if (methodRules.any) return methodRules.any
  return DEFAULT_RULE
}
