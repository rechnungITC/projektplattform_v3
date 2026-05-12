/**
 * PROJ-34-δ — Offene Antworten für einen Stakeholder.
 *
 *   GET /api/projects/[id]/stakeholders/[sid]/interactions/awaiting
 *     → { interactions: AwaitingInteraction[] }
 *
 * Findet alle Interactions in denen der Stakeholder Participant ist,
 * `awaiting_response = true`, nicht soft-deleted. Computed `is_overdue`
 * pro CIA-L5 lazy-on-read (kein Cron) — `response_due_date < CURRENT_DATE`.
 */

import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../../_lib/route-helpers"

interface Ctx {
  params: Promise<{ id: string; sid: string }>
}

const UuidSchema = z.string().uuid()

export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
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

  // Bridge → interaction-ids of THIS stakeholder.
  const bridgeRes = await supabase
    .from("stakeholder_interaction_participants")
    .select("interaction_id")
    .eq("project_id", projectId)
    .eq("stakeholder_id", sid)
    .limit(500)

  if (bridgeRes.error) {
    return apiError("internal_error", bridgeRes.error.message, 500)
  }

  const interactionIds = (bridgeRes.data ?? []).map((r) => r.interaction_id)
  if (interactionIds.length === 0) {
    return Response.json({ interactions: [] })
  }

  const interactionsRes = await supabase
    .from("stakeholder_interactions")
    .select(
      "id, channel, direction, interaction_date, summary, response_due_date, response_received_date, created_at",
    )
    .in("id", interactionIds)
    .eq("awaiting_response", true)
    .is("deleted_at", null)
    .order("response_due_date", { ascending: true, nullsFirst: false })
    .limit(200)

  if (interactionsRes.error) {
    return apiError("internal_error", interactionsRes.error.message, 500)
  }

  // CIA-L5 — overdue is a lazy-on-read derived flag, no DB column,
  // no nightly cron. Comparison on date-string is safe in ISO format.
  const today = new Date().toISOString().slice(0, 10)
  const interactions = (interactionsRes.data ?? []).map((row) => ({
    ...row,
    is_overdue:
      row.response_due_date !== null && row.response_due_date < today,
  }))

  return Response.json({ interactions })
}
