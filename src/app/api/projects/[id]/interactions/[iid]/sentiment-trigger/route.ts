/**
 * PROJ-34-γ.2 — Trigger AI sentiment generation for an interaction.
 *
 *   POST /api/projects/[id]/interactions/[iid]/sentiment-trigger
 *     → { run: { provider, model, status, confidence_avg } }
 *
 * Builds a `SentimentAutoContext` from the interaction summary + the
 * stakeholder display names of each participant, calls γ.1's
 * `invokeSentimentGeneration` (Class-3-locked, cost-capped, stub-fallback),
 * and writes the resulting signals to the
 * `stakeholder_interaction_participants` bridge with
 * `_source = 'ai_proposed'`. The UI's AI-Vorschlag-Pill then opens the
 * γ.2 review sheet.
 *
 * On `external_blocked` (no tenant provider key): no rows written; the
 * frontend renders a banner instead of the pill.
 */

import type { NextResponse } from "next/server"
import { z } from "zod"

import { invokeSentimentGeneration } from "@/lib/ai/router"
import type { SentimentAutoContext } from "@/lib/ai/types"

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

export async function POST(
  _request: Request,
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
  const tenantId = (access.project as { tenant_id: string }).tenant_id

  // Load interaction + participants. RLS guards tenant boundaries.
  const interactionRes = await supabase
    .from("stakeholder_interactions")
    .select("id, summary, deleted_at")
    .eq("id", iid)
    .eq("project_id", projectId)
    .maybeSingle()
  if (interactionRes.error) {
    return apiError("internal_error", interactionRes.error.message, 500)
  }
  if (!interactionRes.data || interactionRes.data.deleted_at) {
    return apiError("not_found", "Interaction not found.", 404)
  }

  const participantsRes = await supabase
    .from("stakeholder_interaction_participants")
    .select("stakeholder_id")
    .eq("interaction_id", iid)
    .eq("project_id", projectId)
  if (participantsRes.error) {
    return apiError("internal_error", participantsRes.error.message, 500)
  }
  const stakeholderIds = (participantsRes.data ?? []).map(
    (p) => p.stakeholder_id,
  )
  if (stakeholderIds.length === 0) {
    return apiError(
      "validation_error",
      "Interaction has no participants — nothing to analyse.",
      400,
    )
  }

  // Display labels for the SentimentAutoContext. Names only; no PII.
  const namesRes = await supabase
    .from("stakeholders")
    .select("id, name")
    .in("id", stakeholderIds)
  if (namesRes.error) {
    return apiError("internal_error", namesRes.error.message, 500)
  }
  const nameById = new Map<string, string>(
    (namesRes.data ?? []).map((s) => [s.id, s.name]),
  )

  const context: SentimentAutoContext = {
    summary: interactionRes.data.summary,
    participants: stakeholderIds.map((sid) => ({
      stakeholder_id: sid,
      label: nameById.get(sid) ?? "Stakeholder",
    })),
  }

  const result = await invokeSentimentGeneration({
    supabase,
    tenantId,
    projectId,
    actorUserId: userId,
    context,
  })

  const confidenceAvg =
    result.signals.length === 0
      ? null
      : result.signals.reduce((acc, s) => acc + s.confidence, 0) /
        result.signals.length

  // external_blocked: no signals to write. UI shows the banner.
  if (result.external_blocked) {
    return Response.json({
      run: {
        provider: result.provider,
        model: result.model_id,
        status: result.status,
        confidence_avg: null,
      },
    })
  }

  // Write proposals to the bridge — one UPDATE per participant. Sequential
  // for clarity; the typical fan-out is < 10 rows and the round-trip is
  // dwarfed by the AI call latency.
  for (const signal of result.signals) {
    const updateRes = await supabase
      .from("stakeholder_interaction_participants")
      .update({
        participant_sentiment: signal.sentiment,
        participant_sentiment_source: "ai_proposed",
        participant_sentiment_model: result.model_id,
        participant_sentiment_provider: result.provider,
        participant_sentiment_confidence: signal.confidence,
        participant_cooperation_signal: signal.cooperation_signal,
        participant_cooperation_signal_source: "ai_proposed",
      })
      .eq("interaction_id", iid)
      .eq("stakeholder_id", signal.stakeholder_id)
      .eq("project_id", projectId)
      .select("stakeholder_id")
      .maybeSingle()
    if (updateRes.error) {
      return apiError("internal_error", updateRes.error.message, 500)
    }
  }

  return Response.json({
    run: {
      provider: result.provider,
      model: result.model_id,
      status: result.status,
      confidence_avg: confidenceAvg,
    },
  })
}
