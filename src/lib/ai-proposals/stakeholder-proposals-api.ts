/**
 * PROJ-88 — FE client wrappers for the stakeholder-proposals purpose
 * (`proposal_stakeholders_from_context`). Mirror of
 * `proposal-from-context-api.ts`: list / trigger / reject / accept /
 * undo / inline-edit against the PROJ-88 routes.
 *
 * The purpose is Class-3-pinned server-side — these wrappers carry no
 * routing decisions; a tenant without Ollama receives
 * `external_blocked` + an actionable `error_message`.
 */

export type StakeholderProposalKind = "person" | "organization"
export type StakeholderProposalOrigin = "internal" | "external"
export type StakeholderProposalConfidence = "low" | "medium" | "high"
export type StakeholderProposalRelevance = "on_goal" | "off_goal"

export interface StakeholderProposalSuggestionPayload {
  name: string
  kind: StakeholderProposalKind
  origin: StakeholderProposalOrigin
  role_key: string | null
  org_unit: string | null
  contact_email: string | null
  contact_phone: string | null
  duplicate_of_stakeholder_id: string | null
  source_quote: string | null
  confidence: StakeholderProposalConfidence
  relevance: StakeholderProposalRelevance
  /** Reviewer-set accept options (L2). */
  create_resource?: boolean
  linked_user_id?: string | null
  display?: {
    source_project_name?: string | null
    context_source_title?: string | null
  }
}

export interface StakeholderProposalSuggestionRow {
  id: string
  tenant_id: string
  project_id: string
  ki_run_id: string
  purpose: "proposal_stakeholders_from_context"
  payload: StakeholderProposalSuggestionPayload
  original_payload: StakeholderProposalSuggestionPayload
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

export interface RouterStakeholderProposalsResult {
  run_id: string
  classification: 1 | 2 | 3
  provider: string
  model_id: string | null
  status: "success" | "error" | "external_blocked"
  suggestion_ids: string[]
  external_blocked: boolean
  error_message?: string
}

export interface AcceptStakeholderProposalsResult {
  accepted_suggestion_ids: string[]
  created_stakeholder_ids: string[]
  created_resource_ids: string[]
  linked_stakeholder_ids: string[]
  accepted_at: string
}

export interface UndoStakeholderProposalsResult {
  reverted_suggestion_ids: string[]
  reverted_stakeholder_ids: string[]
  reverted_resource_ids: string[]
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
  `/api/projects/${encodeURIComponent(projectId)}/ai/stakeholder-proposals`

export async function listStakeholderProposalSuggestions(
  projectId: string,
  options: { status?: "draft" | "accepted" | "rejected" } = {},
): Promise<StakeholderProposalSuggestionRow[]> {
  const url = options.status
    ? `${base(projectId)}?status=${options.status}`
    : base(projectId)
  const response = await fetch(url, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as {
    suggestions: StakeholderProposalSuggestionRow[]
  }
  return body.suggestions ?? []
}

export async function triggerStakeholderProposals(
  projectId: string,
  options: { contextSourceId: string; count?: number },
): Promise<RouterStakeholderProposalsResult> {
  const response = await fetch(base(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contextSourceId: options.contextSourceId,
      count: options.count ?? 10,
    }),
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as RouterStakeholderProposalsResult
}

export async function rejectStakeholderProposalSuggestion(
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
export async function acceptStakeholderProposals(
  projectId: string,
  suggestionIds: string[],
): Promise<AcceptStakeholderProposalsResult> {
  if (suggestionIds.length === 0) {
    throw new Error("suggestionIds must contain at least one id")
  }
  const response = await fetch(`${base(projectId)}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ suggestionIds }),
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as AcceptStakeholderProposalsResult
}

/** Undo a bulk-accept within the 30-s window. Pass the
 *  `accepted_suggestion_ids[]` returned from `acceptStakeholderProposals`. */
export async function undoStakeholderProposalsAccept(
  projectId: string,
  suggestionIds: string[],
): Promise<UndoStakeholderProposalsResult> {
  if (suggestionIds.length === 0) {
    throw new Error("suggestionIds must contain at least one id")
  }
  const response = await fetch(`${base(projectId)}/undo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ suggestionIds }),
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as UndoStakeholderProposalsResult
}

/** Inline-edit a draft suggestion. The FULL payload must be sent — the
 *  server replaces `payload` entirely (Zod-validated per purpose) and
 *  flips `is_modified=true`; `original_payload` stays immutable. */
export async function editStakeholderProposalSuggestion(
  suggestionId: string,
  payload: StakeholderProposalSuggestionPayload,
): Promise<StakeholderProposalSuggestionRow> {
  const response = await fetch(
    `/api/ki/suggestions/${encodeURIComponent(suggestionId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    },
  )
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as StakeholderProposalSuggestionRow
}
