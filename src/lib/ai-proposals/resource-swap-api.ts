/**
 * PROJ-65 ε.4.β — fetch wrappers around /api/projects/[id]/ai/resource-swap.
 */

export type ResourceSwapKind =
  | "skill_mismatch"
  | "overallocation"
  | "cost_optimization"
  | "availability"

export interface ResourceSwapSuggestionPayload {
  title: string
  rationale: string
  kind: ResourceSwapKind
  work_item_id: string
  from_resource_id: string
  to_resource_id: string
  fit_score: number
  confidence: "low" | "medium" | "high"
  /** Server-side enrichment for FE display — denormalised names so the
   *  drawer card renders without extra round-trips. */
  display?: {
    work_item_title: string | null
    from_resource_name: string | null
    to_resource_name: string | null
  }
}

export interface ResourceSwapSuggestionRow {
  id: string
  tenant_id: string
  project_id: string
  ki_run_id: string
  purpose: "resource_swap"
  payload: ResourceSwapSuggestionPayload
  original_payload: ResourceSwapSuggestionPayload
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

export interface RouterResourceSwapResult {
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
  `/api/projects/${encodeURIComponent(projectId)}/ai/resource-swap`

export async function listResourceSwapSuggestions(
  projectId: string,
  options: { status?: "draft" | "accepted" | "rejected" } = {},
): Promise<ResourceSwapSuggestionRow[]> {
  const url = options.status ? `${base(projectId)}?status=${options.status}` : base(projectId)
  const response = await fetch(url, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as {
    suggestions: ResourceSwapSuggestionRow[]
  }
  return body.suggestions ?? []
}

export async function triggerResourceSwap(
  projectId: string,
  options: { count?: number } = {},
): Promise<RouterResourceSwapResult> {
  const response = await fetch(base(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: options.count ?? 3 }),
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as RouterResourceSwapResult
}

export async function acceptResourceSwapSuggestion(
  projectId: string,
  suggestionId: string,
): Promise<void> {
  const response = await fetch(
    `${base(projectId)}/${encodeURIComponent(suggestionId)}/accept`,
    { method: "POST" },
  )
  if (!response.ok) throw new Error(await safeError(response))
}

export async function rejectResourceSwapSuggestion(
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
