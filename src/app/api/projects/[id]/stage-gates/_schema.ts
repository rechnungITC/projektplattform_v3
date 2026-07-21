/**
 * PROJ-110 — Stage-Gate route schemas, colocated so routes and tests share
 * the single source of truth.
 */

import { z } from "zod"

export const GATE_DECISIONS = ["freigabe", "auflage", "abbruch"] as const
export type GateDecision = (typeof GATE_DECISIONS)[number]

export const CONFIDENTIALITY_LEVELS = [
  "standard",
  "confidential",
  "strict",
] as const

// Columns returned by the list/decide endpoints. `decision_reason` and
// `conditions` may hold confidential text — they are only reachable when the
// RESTRICTIVE `can_access_classified` RLS gate lets the caller see the row.
export const STAGE_GATE_COLUMNS =
  "id, tenant_id, project_id, gate_key, label, sequence_number, target_phase_id, status, decision, conditions, decision_reason, decision_id, decided_by, decided_at, confidentiality_level, created_at, updated_at"

export const decideStageGateSchema = z.object({
  decision: z.enum(GATE_DECISIONS),
  reason: z.string().max(10000).optional().nullable(),
  conditions: z.string().max(10000).optional().nullable(),
  confidentiality_level: z.enum(CONFIDENTIALITY_LEVELS).optional().nullable(),
})

export type DecideStageGateInput = z.infer<typeof decideStageGateSchema>
