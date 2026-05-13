/**
 * PROJ-34-γ.2 — Batch transition AI sentiment proposals.
 *
 *   PATCH /api/projects/[id]/interactions/[iid]/ai-review
 *     body: { decisions: [{ stakeholder_id, decision, overrides? }] }
 *     → { updated_participants: InteractionParticipant[] }
 *
 * Transitions:
 *   - accept   → `_source = 'ai_accepted'`, values preserved.
 *   - reject   → `_source = 'ai_rejected'`, values null.
 *   - modify   → `_source = 'manual'`, values from `overrides`. Provider/
 *                model/confidence reset (manual edit erases AI provenance).
 *
 * Idempotent: WHERE-clauses include `_source = 'ai_proposed'` so re-running
 * the batch on already-decided rows is a no-op rather than a re-transition.
 * Field-level audit fires automatically through the PROJ-10 trigger on
 * `stakeholder_interaction_participants`.
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
  params: Promise<{ id: string; iid: string }>
}

const UuidSchema = z.string().uuid()

const SignalSchema = z.number().int().min(-2).max(2)

const DecisionSchema = z.discriminatedUnion("decision", [
  z.object({
    stakeholder_id: UuidSchema,
    decision: z.literal("accept"),
  }),
  z.object({
    stakeholder_id: UuidSchema,
    decision: z.literal("reject"),
  }),
  z.object({
    stakeholder_id: UuidSchema,
    decision: z.literal("modify"),
    overrides: z.object({
      sentiment: SignalSchema,
      cooperation: SignalSchema,
    }),
  }),
])

const BodySchema = z.object({
  decisions: z.array(DecisionSchema).min(1).max(50),
})

export async function PATCH(
  request: Request,
  ctx: Ctx,
): Promise<Response | NextResponse<ApiErrorBody>> {
  const { id: projectId, iid } = await ctx.params
  if (!UuidSchema.safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!UuidSchema.safeParse(iid).success) {
    return apiError("validation_error", "Invalid interaction id.", 400, "iid")
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

  // Apply per-decision UPDATEs. Each UPDATE narrows by
  // `_source = 'ai_proposed'` so re-running the batch is idempotent — a
  // row that was already accepted/rejected/manual stays untouched.
  for (const d of parsed.data.decisions) {
    let update: Record<string, unknown>
    if (d.decision === "accept") {
      update = {
        participant_sentiment_source: "ai_accepted",
        participant_cooperation_signal_source: "ai_accepted",
      }
    } else if (d.decision === "reject") {
      update = {
        participant_sentiment: null,
        participant_sentiment_source: "ai_rejected",
        participant_sentiment_model: null,
        participant_sentiment_provider: null,
        participant_sentiment_confidence: null,
        participant_cooperation_signal: null,
        participant_cooperation_signal_source: "ai_rejected",
      }
    } else {
      // modify — manual override, clear AI provenance.
      update = {
        participant_sentiment: d.overrides.sentiment,
        participant_sentiment_source: "manual",
        participant_sentiment_model: null,
        participant_sentiment_provider: null,
        participant_sentiment_confidence: null,
        participant_cooperation_signal: d.overrides.cooperation,
        participant_cooperation_signal_source: "manual",
      }
    }
    const upRes = await supabase
      .from("stakeholder_interaction_participants")
      .update(update)
      .eq("interaction_id", iid)
      .eq("stakeholder_id", d.stakeholder_id)
      .eq("project_id", projectId)
      .eq("participant_sentiment_source", "ai_proposed")
      .select("stakeholder_id")
    if (upRes.error) {
      return apiError("internal_error", upRes.error.message, 500)
    }
  }

  // Re-fetch all participants for this interaction so the frontend can
  // refresh its local cache in one round-trip.
  const refetch = await supabase
    .from("stakeholder_interaction_participants")
    .select(
      "interaction_id, stakeholder_id, participant_sentiment, participant_sentiment_source, participant_sentiment_model, participant_sentiment_provider, participant_sentiment_confidence, participant_cooperation_signal, participant_cooperation_signal_source",
    )
    .eq("interaction_id", iid)
    .eq("project_id", projectId)
  if (refetch.error) {
    return apiError("internal_error", refetch.error.message, 500)
  }

  return Response.json({ updated_participants: refetch.data ?? [] })
}
