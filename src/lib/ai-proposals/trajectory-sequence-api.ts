/**
 * PROJ-65 ε.4.α — fetch wrappers around
 * /api/projects/[id]/ai/trajectory-sequence and /api/ki/suggestions/[id]/reject.
 */

export type TrajectorySequenceKind =
  | "parallelize"
  | "reorder"
  | "serialize"
  | "merge"

export interface TrajectorySequenceSuggestionPayload {
  title: string
  rationale: string
  kind: TrajectorySequenceKind
  affected_node_ids: string[]
  estimated_savings_days: number | null
  confidence: "low" | "medium" | "high"
}

export interface TrajectorySequenceSuggestionRow {
  id: string
  tenant_id: string
  project_id: string
  ki_run_id: string
  purpose: "trajectory_sequence"
  payload: TrajectorySequenceSuggestionPayload
  original_payload: TrajectorySequenceSuggestionPayload
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

export interface RouterTrajectorySequenceResult {
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
  `/api/projects/${encodeURIComponent(projectId)}/ai/trajectory-sequence`

export async function listTrajectorySequenceSuggestions(
  projectId: string,
  options: { status?: "draft" | "accepted" | "rejected" } = {},
): Promise<TrajectorySequenceSuggestionRow[]> {
  const url = options.status ? `${base(projectId)}?status=${options.status}` : base(projectId)
  const response = await fetch(url, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as {
    suggestions: TrajectorySequenceSuggestionRow[]
  }
  return body.suggestions ?? []
}

export async function triggerTrajectorySequence(
  projectId: string,
  options: { count?: number } = {},
): Promise<RouterTrajectorySequenceResult> {
  const response = await fetch(base(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: options.count ?? 3 }),
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as RouterTrajectorySequenceResult
}

export async function acceptTrajectorySequenceSuggestion(
  projectId: string,
  suggestionId: string,
): Promise<void> {
  const response = await fetch(
    `${base(projectId)}/${encodeURIComponent(suggestionId)}/accept`,
    { method: "POST" },
  )
  if (!response.ok) throw new Error(await safeError(response))
}

export async function rejectTrajectorySequenceSuggestion(
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
