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

// ---------------------------------------------------------------------------
// PROJ-70-β — accept / undo / inline-edit
// ---------------------------------------------------------------------------

export interface AcceptProposalFromContextResult {
  accepted_suggestion_ids: string[]
  created_work_item_ids: string[]
  accepted_at: string
}

export interface UndoProposalFromContextResult {
  reverted_suggestion_ids: string[]
  reverted_work_item_ids: string[]
}

/** Bulk-accept N suggestions (N≥1). Server runs topological-sort + atomic
 *  transaction. Returns the `causation`-style ids needed for Undo. */
export async function acceptProposalFromContext(
  projectId: string,
  suggestionIds: string[],
  options: { methodValidationStrict?: boolean } = {},
): Promise<AcceptProposalFromContextResult> {
  if (suggestionIds.length === 0) {
    throw new Error("suggestionIds must contain at least one id")
  }
  const response = await fetch(`${base(projectId)}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      suggestionIds,
      methodValidationStrict: options.methodValidationStrict ?? true,
    }),
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as AcceptProposalFromContextResult
}

/** Undo a bulk-accept within the 30-s window. Pass the
 *  `accepted_suggestion_ids[]` returned from `acceptProposalFromContext`. */
export async function undoProposalFromContextAccept(
  projectId: string,
  suggestionIds: string[],
): Promise<UndoProposalFromContextResult> {
  if (suggestionIds.length === 0) {
    throw new Error("suggestionIds must contain at least one id")
  }
  const response = await fetch(`${base(projectId)}/undo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ suggestionIds }),
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as UndoProposalFromContextResult
}

/** Inline-edit a draft suggestion's title / kind / description. The full
 *  payload (other fields unchanged) must be sent — the server replaces
 *  `payload` entirely and flips `is_modified=true`. Keeps `original_payload`
 *  intact for audit. */
export async function editProposalFromContextSuggestion(
  suggestionId: string,
  payload: ProposalFromContextSuggestionPayload,
): Promise<ProposalFromContextSuggestionRow> {
  const response = await fetch(
    `/api/ki/suggestions/${encodeURIComponent(suggestionId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    },
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as {
    suggestion: ProposalFromContextSuggestionRow
  }
  return body.suggestion
}

// ---------------------------------------------------------------------------
// PROJ-70-γ — File-upload wrapper
// ---------------------------------------------------------------------------

export interface UploadContextSourceArgs {
  file: File
  kind: string
  title: string
  projectId?: string | null
  language?: "de" | "en"
}

export interface ContextSourceRow {
  id: string
  tenant_id: string
  project_id: string | null
  kind: string
  title: string
  content_excerpt: string | null
  content_full_url: string | null
  source_metadata: Record<string, unknown>
  language: string | null
  privacy_class: 1 | 2 | 3
  processing_status: string
  last_processed_at: string | null
  last_failure_reason: string | null
  original_filename: string | null
  mime_type: string | null
  file_size_bytes: number | null
  created_by: string
  created_at: string
  updated_at: string
}

/**
 * Upload a kickoff artefact (PDF/DOCX/TXT/MD) via the multipart path of
 * `POST /api/context-sources`. Server-side does magic-byte sniff +
 * parser dispatch + 20s timeout + 25 MB cap + storage write.
 *
 * Returns the freshly-created `context_sources` row including its `id`,
 * which the caller passes to `triggerProposalFromContext` to kick off
 * the AI run.
 */
export async function uploadContextSourceFile(
  args: UploadContextSourceArgs,
): Promise<ContextSourceRow> {
  const fd = new FormData()
  fd.append("file", args.file)
  fd.append("kind", args.kind)
  fd.append("title", args.title)
  if (args.projectId) fd.append("project_id", args.projectId)
  if (args.language) fd.append("language", args.language)

  const response = await fetch("/api/context-sources", {
    method: "POST",
    body: fd,
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { context_source: ContextSourceRow }
  return body.context_source
}
