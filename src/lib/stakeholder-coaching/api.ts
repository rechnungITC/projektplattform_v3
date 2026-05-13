/**
 * PROJ-34-ε — Client-side API helpers for coaching recommendations.
 *
 * Mirror of stakeholder-interactions/api.ts pattern: fetch + throw on
 * non-ok with structured error parsing.
 */

export type CoachingRecommendationKind =
  | "outreach"
  | "tonality"
  | "escalation"
  | "celebration"

export type CoachingReviewState =
  | "draft"
  | "accepted"
  | "rejected"
  | "modified"

export interface CoachingRecommendation {
  id: string
  tenant_id: string
  project_id: string
  stakeholder_id: string
  recommendation_kind: CoachingRecommendationKind
  recommendation_text: string
  modified_text: string | null
  review_state: CoachingReviewState
  cited_interaction_ids: string[]
  cited_profile_fields: string[]
  provider: string | null
  model_id: string | null
  confidence: number | null
  ki_run_id: string | null
  prompt_context_meta: Record<string, unknown>
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CoachingRunMetadata {
  provider: string | null
  model: string | null
  status: "success" | "external_blocked" | "error" | "pending"
  tonality_hint: string | null
}

export type CoachingDecisionKind = "accept" | "reject" | "modify"

export type CoachingDecision =
  | { recommendation_id: string; decision: "accept" }
  | { recommendation_id: string; decision: "reject" }
  | {
      recommendation_id: string
      decision: "modify"
      modified_text: string
    }

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

async function unwrap<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let msg = `HTTP ${response.status}`
    try {
      const body = (await response.json()) as ApiErrorBody
      msg = body.error?.message ?? msg
    } catch {
      // ignore
    }
    throw new Error(msg)
  }
  return (await response.json()) as T
}

export async function listCoachingRecommendations(
  projectId: string,
  stakeholderId: string,
  options: { reviewState?: CoachingReviewState } = {},
): Promise<CoachingRecommendation[]> {
  const url = new URL(
    `/api/projects/${encodeURIComponent(projectId)}/stakeholders/${encodeURIComponent(stakeholderId)}/coaching-recommendations`,
    "http://placeholder",
  )
  if (options.reviewState) {
    url.searchParams.set("review_state", options.reviewState)
  }
  const res = await fetch(url.pathname + url.search, { cache: "no-store" })
  const body = await unwrap<{ recommendations: CoachingRecommendation[] }>(res)
  return body.recommendations
}

export async function triggerCoachingGeneration(
  projectId: string,
  stakeholderId: string,
): Promise<{
  run: CoachingRunMetadata
  recommendations: CoachingRecommendation[]
}> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/stakeholders/${encodeURIComponent(stakeholderId)}/coaching-trigger`,
    { method: "POST" },
  )
  return unwrap<{
    run: CoachingRunMetadata
    recommendations: CoachingRecommendation[]
  }>(res)
}

export async function submitCoachingReviewBatch(
  projectId: string,
  stakeholderId: string,
  decisions: CoachingDecision[],
): Promise<{ updated: CoachingRecommendation[] }> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/stakeholders/${encodeURIComponent(stakeholderId)}/coaching-recommendations/review`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisions }),
    },
  )
  return unwrap<{ updated: CoachingRecommendation[] }>(res)
}
