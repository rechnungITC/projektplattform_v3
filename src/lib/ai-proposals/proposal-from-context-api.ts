/**
 * PROJ-70-α — fetch wrappers around the proposal-from-context API.
 *
 * Three endpoints:
 *   - list   →  GET  /api/projects/[id]/ai/proposal-from-context
 *   - trigger → POST /api/projects/[id]/ai/proposal-from-context
 *   - reject →  POST /api/ki/suggestions/[id]/reject (purpose-agnostic, shared)
 *
 * The 70-α slice does NOT include an `accept` wrapper — that's part of
 * 70-β where the accept-pipeline (bulk + topological-sort + work_items
 * create) gets locked.
 */

export type ProposalFromContextKind =
  | "phase"
  | "work_package"
  | "todo"
  | "epic"
  | "story"
  | "task"
  | "subtask"
  | "bug"

export type ProposalFromContextConfidence = "low" | "medium" | "high"

export interface ProposalFromContextSuggestionPayload {
  temp_id: string
  parent_temp_id: string | null
  kind: ProposalFromContextKind
  title: string
  description: string | null
  confidence: ProposalFromContextConfidence
  /** Server-side enrichment so the FE renders without extra round-trips. */
  display?: {
    method_hint_kind: string | null
    source_project_name: string | null
    context_source_title: string | null
  }
}

export interface ProposalFromContextSuggestionRow {
  id: string
  tenant_id: string
  project_id: string
  ki_run_id: string
  purpose: "proposal_from_context"
  payload: ProposalFromContextSuggestionPayload
  original_payload: ProposalFromContextSuggestionPayload
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

export interface RouterProposalFromContextResult {
  run_id: string
  classification: 1 | 2 | 3
  provider: string
  model_id: string | null
  status: "success" | "error" | "external_blocked"
  suggestion_ids: string[]
  external_blocked: boolean
  error_message?: string
}

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
  `/api/projects/${encodeURIComponent(projectId)}/ai/proposal-from-context`

export async function listProposalFromContextSuggestions(
  projectId: string,
  options: { status?: "draft" | "accepted" | "rejected" } = {},
): Promise<ProposalFromContextSuggestionRow[]> {
  const url = options.status
    ? `${base(projectId)}?status=${options.status}`
    : base(projectId)
  const response = await fetch(url, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as {
    suggestions: ProposalFromContextSuggestionRow[]
  }
  return body.suggestions ?? []
}

export async function triggerProposalFromContext(
  projectId: string,
  options: { contextSourceId: string; count?: number },
): Promise<RouterProposalFromContextResult> {
  const response = await fetch(base(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contextSourceId: options.contextSourceId,
      count: options.count ?? 10,
    }),
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as RouterProposalFromContextResult
}

export async function rejectProposalFromContextSuggestion(
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
