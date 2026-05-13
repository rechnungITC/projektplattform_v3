/**
 * PROJ-34-ε.δ — List coaching recommendations for a stakeholder.
 *
 *   GET /api/projects/[id]/stakeholders/[sid]/coaching-recommendations
 *     query:
 *       review_state? — filter ('draft' | 'accepted' | 'rejected' | 'modified')
 *     → { recommendations: CoachingRecommendationRow[] }
 *
 * Returns non-soft-deleted rows ordered by created_at desc. RLS enforces
 * project-membership via the bridge policy on the table.
 */

import type { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
  type ApiErrorBody,
} from "../../../../../_lib/route-helpers"

interface Ctx {
  params: Promise<{ id: string; sid: string }>
}

const UuidSchema = z.string().uuid()
const ReviewStateSchema = z.enum([
  "draft",
  "accepted",
  "rejected",
  "modified",
])

const RECOMMENDATION_COLUMNS =
  "id, tenant_id, project_id, stakeholder_id, recommendation_kind, recommendation_text, modified_text, review_state, cited_interaction_ids, cited_profile_fields, provider, model_id, confidence, ki_run_id, prompt_context_meta, created_by, created_at, updated_at"

export async function GET(
  request: Request,
  ctx: Ctx,
): Promise<Response | NextResponse<ApiErrorBody>> {
  const { id: projectId, sid } = await ctx.params
  if (!UuidSchema.safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!UuidSchema.safeParse(sid).success) {
    return apiError("validation_error", "Invalid stakeholder id.", 400, "sid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const url = new URL(request.url)
  const reviewStateParam = url.searchParams.get("review_state")
  let reviewState: z.infer<typeof ReviewStateSchema> | null = null
  if (reviewStateParam) {
    const parsed = ReviewStateSchema.safeParse(reviewStateParam)
    if (!parsed.success) {
      return apiError(
        "validation_error",
        "Invalid review_state.",
        400,
        "review_state",
      )
    }
    reviewState = parsed.data
  }

  let query = supabase
    .from("stakeholder_coaching_recommendations")
    .select(RECOMMENDATION_COLUMNS)
    .eq("project_id", projectId)
    .eq("stakeholder_id", sid)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200)
  if (reviewState) {
    query = query.eq("review_state", reviewState)
  }
  const res = await query
  if (res.error) {
    return apiError("internal_error", res.error.message, 500)
  }
  return Response.json({ recommendations: res.data ?? [] })
}
