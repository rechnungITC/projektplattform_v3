/**
 * PROJ-34-ε.δ — Batch transition coaching recommendations.
 *
 *   PATCH /api/projects/[id]/stakeholders/[sid]/coaching-recommendations/review
 *     body: { decisions: [{ recommendation_id, decision, modified_text? }] }
 *     → { updated: CoachingRecommendationRow[] }
 *
 * Transitions per decision (locked 2026-05-13):
 *   - accept   → review_state='accepted'.
 *   - reject   → review_state='rejected'.
 *   - modify   → review_state='modified', modified_text persisted; original
 *                `recommendation_text` stays intact for audit.
 *
 * Idempotent: WHERE clauses include `review_state='draft'` so re-running
 * the batch on already-decided rows is a no-op.
 */

import type { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
  type ApiErrorBody,
} from "../../../../../../_lib/route-helpers"

interface Ctx {
  params: Promise<{ id: string; sid: string }>
}

const UuidSchema = z.string().uuid()

const DecisionSchema = z.discriminatedUnion("decision", [
  z.object({
    recommendation_id: UuidSchema,
    decision: z.literal("accept"),
  }),
  z.object({
    recommendation_id: UuidSchema,
    decision: z.literal("reject"),
  }),
  z.object({
    recommendation_id: UuidSchema,
    decision: z.literal("modify"),
    modified_text: z.string().min(1).max(1000),
  }),
])

const BodySchema = z.object({
  decisions: z.array(DecisionSchema).min(1).max(20),
})

const RECOMMENDATION_COLUMNS =
  "id, tenant_id, project_id, stakeholder_id, recommendation_kind, recommendation_text, modified_text, review_state, cited_interaction_ids, cited_profile_fields, provider, model_id, confidence, ki_run_id, prompt_context_meta, created_by, created_at, updated_at"

export async function PATCH(
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
  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return apiError(
      "validation_error",
      issue?.message ?? "Validation failed.",
      400,
      issue?.path?.join(".") ?? undefined,
    )
  }

  // Each UPDATE narrows by review_state='draft' for idempotency.
  for (const d of parsed.data.decisions) {
    let update: Record<string, unknown>
    if (d.decision === "accept") {
      update = { review_state: "accepted" }
    } else if (d.decision === "reject") {
      update = { review_state: "rejected" }
    } else {
      update = {
        review_state: "modified",
        modified_text: d.modified_text,
      }
    }
    const upRes = await supabase
      .from("stakeholder_coaching_recommendations")
      .update(update)
      .eq("id", d.recommendation_id)
      .eq("project_id", projectId)
      .eq("stakeholder_id", sid)
      .eq("review_state", "draft")
      .is("deleted_at", null)
      .select("id")
    if (upRes.error) {
      return apiError("internal_error", upRes.error.message, 500)
    }
  }

  const refetch = await supabase
    .from("stakeholder_coaching_recommendations")
    .select(RECOMMENDATION_COLUMNS)
    .eq("project_id", projectId)
    .eq("stakeholder_id", sid)
    .in(
      "id",
      parsed.data.decisions.map((d) => d.recommendation_id),
    )
  if (refetch.error) {
    return apiError("internal_error", refetch.error.message, 500)
  }

  return Response.json({ updated: refetch.data ?? [] })
}
