/**
 * PROJ-110 — fetch wrappers for the Stage-Gate workflow. Gates are seeded from
 * a 9-gate preset, carry a pre-read readiness view, and are decided
 * (Freigabe / Auflage / Abbruch) via a single atomic RPC that also writes the
 * PROJ-20 decision log entry and drives the phase/project state machine.
 * Consumed by the /frontend slice (Stage-Gates tab in the M&A project room).
 */

import type { MaConfidentialityLevel } from "@/types/confidentiality"

export type StageGateStatus = "pending" | "passed" | "conditional" | "aborted"
export type StageGateDecision = "freigabe" | "auflage" | "abbruch"

export interface StageGate {
  id: string
  tenant_id: string
  project_id: string
  gate_key: string
  label: string
  sequence_number: number
  target_phase_id: string | null
  status: StageGateStatus
  decision: StageGateDecision | null
  conditions: string | null
  decision_reason: string | null
  decision_id: string | null
  decided_by: string | null
  decided_at: string | null
  confidentiality_level: MaConfidentialityLevel
  created_at: string
  updated_at: string
}

export interface StageGatePrereadiness {
  open_tasks: number
  risks_without_measure: number
  open_red_flags: number
  mandatory_deliverables: number | null
  /**
   * PROJ-122 — SPA issues still in status open/escalated. Counted for every
   * gate (gate_key is copied per project and may drift), but only highlighted
   * from the SPA-negotiation gate onwards. Deliberately NOT folded into
   * `has_blocking_readiness`: the spec asks for a hint, not a blocker.
   */
  open_spa_issues: number
  has_blocking_readiness: boolean
}

export interface SeedStageGatesResult {
  seeded: number
  target_phase_backfilled: number
}

export interface DecideStageGateResult {
  gate_id: string
  status: StageGateStatus
  decision: StageGateDecision
  decision_id: string
  target_phase_id: string | null
}

export interface DecideStageGateInput {
  decision: StageGateDecision
  reason?: string | null
  conditions?: string | null
  confidentiality_level?: MaConfidentialityLevel | null
}

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}
async function safeError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorBody
    return body.error?.message ?? `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}
const base = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/stage-gates`

export async function listStageGates(projectId: string): Promise<StageGate[]> {
  const res = await fetch(base(projectId), { cache: "no-store" })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { stage_gates: StageGate[] }).stage_gates ?? []
}

export async function seedStageGates(
  projectId: string
): Promise<SeedStageGatesResult> {
  const res = await fetch(`${base(projectId)}/seed`, { method: "POST" })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { result: SeedStageGatesResult }).result
}

export async function fetchStageGatePrereadiness(
  projectId: string,
  gateId: string
): Promise<StageGatePrereadiness> {
  const res = await fetch(
    `${base(projectId)}/${encodeURIComponent(gateId)}/prereadiness`,
    { cache: "no-store" }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { prereadiness: StageGatePrereadiness })
    .prereadiness
}

export async function decideStageGate(
  projectId: string,
  gateId: string,
  input: DecideStageGateInput
): Promise<DecideStageGateResult> {
  const res = await fetch(
    `${base(projectId)}/${encodeURIComponent(gateId)}/decide`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { result: DecideStageGateResult }).result
}
