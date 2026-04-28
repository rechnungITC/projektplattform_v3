/**
 * PROJ-20 — fetch wrappers around the /api/projects/[id]/decisions surface.
 * Decisions are append-only: revisions go through createDecision with
 * supersedes_decision_id, never PATCH.
 */

import type { Decision } from "@/types/decision"

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

async function safeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody
    return body.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

const base = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/decisions`

export async function listDecisions(
  projectId: string,
  options: { includeRevised?: boolean } = {}
): Promise<Decision[]> {
  const url = options.includeRevised
    ? `${base(projectId)}?include_revised=true`
    : base(projectId)
  const response = await fetch(url, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { decisions: Decision[] }
  return body.decisions ?? []
}

export interface DecisionInput {
  title: string
  decision_text: string
  rationale?: string | null
  decided_at?: string
  decider_stakeholder_id?: string | null
  context_phase_id?: string | null
  context_risk_id?: string | null
  supersedes_decision_id?: string | null
}

export async function createDecision(
  projectId: string,
  input: DecisionInput
): Promise<Decision> {
  const response = await fetch(base(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { decision: Decision }
  return body.decision
}
