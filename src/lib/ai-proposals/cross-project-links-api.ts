/**
 * PROJ-65 ε.4.γ — fetch wrappers around
 * /api/projects/[id]/ai/cross-project-links and /api/ki/suggestions/[id]/reject.
 */

export type CrossProjectLinkKind =
  | "relates"
  | "blocks"
  | "requires"
  | "duplicates"
  | "delivers"
  | "precedes"
  | "includes"

export interface CrossProjectLinkSuggestionPayload {
  title: string
  rationale: string
  kind: CrossProjectLinkKind
  from_work_item_id: string
  to_work_item_id: string | null
  to_project_id: string
  lag_days: number | null
  confidence: "low" | "medium" | "high"
  /** Server-side enrichment for FE display — denormalised so the drawer
   *  renders without extra round-trips. */
  display?: {
    from_work_item_title: string | null
    to_work_item_title: string | null
    to_project_name: string | null
    source_project_name: string | null
  }
}

export interface CrossProjectLinkSuggestionRow {
  id: string
  tenant_id: string
  project_id: string
  ki_run_id: string
  purpose: "cross_project_links"
  payload: CrossProjectLinkSuggestionPayload
  original_payload: CrossProjectLinkSuggestionPayload
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

export interface RouterCrossProjectLinksResult {
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
  `/api/projects/${encodeURIComponent(projectId)}/ai/cross-project-links`

export async function listCrossProjectLinkSuggestions(
  projectId: string,
  options: { status?: "draft" | "accepted" | "rejected" } = {},
): Promise<CrossProjectLinkSuggestionRow[]> {
  const url = options.status ? `${base(projectId)}?status=${options.status}` : base(projectId)
  const response = await fetch(url, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as {
    suggestions: CrossProjectLinkSuggestionRow[]
  }
  return body.suggestions ?? []
}

export async function triggerCrossProjectLinks(
  projectId: string,
  options: { count?: number } = {},
): Promise<RouterCrossProjectLinksResult> {
  const response = await fetch(base(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: options.count ?? 3 }),
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as RouterCrossProjectLinksResult
}

export async function acceptCrossProjectLinkSuggestion(
  projectId: string,
  suggestionId: string,
): Promise<void> {
  const response = await fetch(
    `${base(projectId)}/${encodeURIComponent(suggestionId)}/accept`,
    { method: "POST" },
  )
  if (!response.ok) throw new Error(await safeError(response))
}

export async function rejectCrossProjectLinkSuggestion(
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
