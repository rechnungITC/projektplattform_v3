/**
 * PROJ-34-β — Manual participant-signal editing.
 *
 *   PATCH /api/projects/[id]/interactions/[iid]/participants/[psid]
 *     body: { participant_sentiment?, participant_cooperation_signal? }
 *     → { participant: InteractionParticipant }
 *
 * Per-Participant signals live on the bridge table
 * `stakeholder_interaction_participants` (CIA-L3). When the user moves a
 * manual slider the source is forced to "manual" — AI proposals overwrite
 * via the γ.2 review-queue with sources "ai_accepted" / "ai_rejected" /
 * "ai_proposed".
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
  params: Promise<{ id: string; iid: string; psid: string }>
}

const UuidSchema = z.string().uuid()

const PatchSchema = z.object({
  participant_sentiment: z.number().int().min(-2).max(2).optional().nullable(),
  participant_cooperation_signal: z
    .number()
    .int()
    .min(-2)
    .max(2)
    .optional()
    .nullable(),
})

export async function PATCH(
  request: Request,
  ctx: Ctx,
): Promise<Response | NextResponse<ApiErrorBody>> {
  const { id: projectId, iid, psid } = await ctx.params
  if (!UuidSchema.safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!UuidSchema.safeParse(iid).success) {
    return apiError("validation_error", "Invalid interaction id.", 400, "iid")
  }
  if (!UuidSchema.safeParse(psid).success) {
    return apiError("validation_error", "Invalid participant id.", 400, "psid")
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

  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return apiError(
      "validation_error",
      issue?.message ?? "Validation failed.",
      400,
      issue?.path?.join(".") ?? undefined,
    )
  }
  const input = parsed.data
  const touchesSentiment = input.participant_sentiment !== undefined
  const touchesCooperation = input.participant_cooperation_signal !== undefined
  if (!touchesSentiment && !touchesCooperation) {
    return apiError("validation_error", "No updatable fields provided.", 400)
  }

  // Manual signals fix source to 'manual'. Clearing the value (null) also
  // clears the source so the AI-proposal pill can return on the next round.
  const update: Record<string, unknown> = {}
  if (touchesSentiment) {
    update.participant_sentiment = input.participant_sentiment
    update.participant_sentiment_source =
      input.participant_sentiment == null ? null : "manual"
    update.participant_sentiment_model = null
    update.participant_sentiment_provider = null
    update.participant_sentiment_confidence = null
  }
  if (touchesCooperation) {
    update.participant_cooperation_signal = input.participant_cooperation_signal
    update.participant_cooperation_signal_source =
      input.participant_cooperation_signal == null ? null : "manual"
  }

  const updateRes = await supabase
    .from("stakeholder_interaction_participants")
    .update(update)
    .eq("interaction_id", iid)
    .eq("stakeholder_id", psid)
    .eq("project_id", projectId)
    .select(
      "interaction_id, stakeholder_id, participant_sentiment, participant_sentiment_source, participant_cooperation_signal, participant_cooperation_signal_source",
    )
    .maybeSingle()

  if (updateRes.error) {
    return apiError("internal_error", updateRes.error.message, 500)
  }
  if (!updateRes.data) {
    return apiError("not_found", "Participant not found.", 404)
  }

  return Response.json({ participant: updateRes.data })
}
