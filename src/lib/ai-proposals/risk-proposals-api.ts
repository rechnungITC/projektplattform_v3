/**
 * PROJ-89 — FE client wrappers for the risk-proposals purpose
 * (`proposal_risks_from_context`). Mirror of
 * `stakeholder-proposals-api.ts`: list / trigger / reject / accept /
 * undo / inline-edit against the PROJ-89 routes.
 *
 * Classification is content-based server-side (AC-89.2) — these wrappers
 * carry no routing decisions; a Class-3 document without a local
 * provider receives `external_blocked` + an actionable `error_message`.
 */

export type RiskProposalConfidence = "low" | "medium" | "high"
export type RiskProposalRelevance = "on_goal" | "off_goal"

export interface RiskProposalSuggestionPayload {
  title: string
  description: string | null
  probability: number
  impact: number
  mitigation: string | null
  duplicate_of_risk_id: string | null
  source_quote: string | null
  confidence: RiskProposalConfidence
  relevance: RiskProposalRelevance
  display?: {
    source_project_name?: string | null
    context_source_title?: string | null
  }
}

export interface RiskProposalSuggestionRow {
  id: string
  tenant_id: string
  project_id: string
  ki_run_id: string
  purpose: "proposal_risks_from_context"
  payload: RiskProposalSuggestionPayload
  original_payload: RiskProposalSuggestionPayload
  is_modified: boolean
  status: "draft" | "accepted" | "rejected"
  accepted_entity_type: string | null
  accepted_entity_id: string | null
  rejection_reason: string | null
  created_by: string
  created_at: string
  updated_at: string
  accepted_at: string | null
  rejected_at: string | null
}

export interface RouterRiskProposalsResult {
  run_id: string
  classification: 1 | 2 | 3
  provider: string
  model_id: string | null
  status: "success" | "error" | "external_blocked"
  suggestion_ids: string[]
  external_blocked: boolean
  error_message?: string
  // PROJ-137 — machine-readable reason a run produced no/blocked output.
  // The route returns the router result verbatim, so this is present at
  // runtime; `null`/absent = provider ran (incl. legitimately-empty).
  reason_code?: import("@/lib/ai/types").AiRunReasonCode | null
}

export interface AcceptRiskProposalsResult {
  accepted_suggestion_ids: string[]
  created_risk_ids: string[]
  linked_risk_ids: string[]
  accepted_at: string
}

export interface UndoRiskProposalsResult {
  reverted_suggestion_ids: string[]
  reverted_risk_ids: string[]
}

async function safeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string; code?: string }
    }
    return (
      body.error?.message ?? `Request failed with status ${response.status}`
    )
  } catch {
    return `Request failed with status ${response.status}`
  }
}

const base = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/ai/risk-proposals`

export async function listRiskProposalSuggestions(
  projectId: string,
  options: { status?: "draft" | "accepted" | "rejected" } = {},
): Promise<RiskProposalSuggestionRow[]> {
  const url = options.status
    ? `${base(projectId)}?status=${options.status}`
    : base(projectId)
  const response = await fetch(url, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as {
    suggestions: RiskProposalSuggestionRow[]
  }
  return body.suggestions ?? []
}

export async function triggerRiskProposals(
  projectId: string,
  options: { contextSourceId: string; count?: number },
): Promise<RouterRiskProposalsResult> {
  const response = await fetch(base(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contextSourceId: options.contextSourceId,
      count: options.count ?? 10,
    }),
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as RouterRiskProposalsResult
}

export async function rejectRiskProposalSuggestion(
  suggestionId: string,
  reason?: string,
): Promise<void> {
  const response = await fetch(
    `/api/ki/suggestions/${encodeURIComponent(suggestionId)}/reject`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reason ? { reason } : {}),
    },
  )
  if (!response.ok) throw new Error(await safeError(response))
}

/** Bulk-accept N suggestions (N≥1). Atomic server-side transaction; the
 *  returned id arrays feed the 30-s Undo toast. */
export async function acceptRiskProposals(
  projectId: string,
  suggestionIds: string[],
): Promise<AcceptRiskProposalsResult> {
  if (suggestionIds.length === 0) {
    throw new Error("suggestionIds must contain at least one id")
  }
  const response = await fetch(`${base(projectId)}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ suggestionIds }),
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as AcceptRiskProposalsResult
}

/** Undo a bulk-accept within the 30-s window. Pass the
 *  `accepted_suggestion_ids[]` returned from `acceptRiskProposals`. */
export async function undoRiskProposalsAccept(
  projectId: string,
  suggestionIds: string[],
): Promise<UndoRiskProposalsResult> {
  if (suggestionIds.length === 0) {
    throw new Error("suggestionIds must contain at least one id")
  }
  const response = await fetch(`${base(projectId)}/undo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ suggestionIds }),
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as UndoRiskProposalsResult
}

/** Inline-edit a draft suggestion. The FULL payload must be sent — the
 *  server replaces `payload` entirely (Zod-validated per purpose) and
 *  flips `is_modified=true`; `original_payload` stays immutable. */
export async function editRiskProposalSuggestion(
  suggestionId: string,
  payload: RiskProposalSuggestionPayload,
): Promise<RiskProposalSuggestionRow> {
  const response = await fetch(
    `/api/ki/suggestions/${encodeURIComponent(suggestionId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    },
  )
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as RiskProposalSuggestionRow
}
