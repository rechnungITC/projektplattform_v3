/**
 * PROJ-34-α — List + Create interactions for a stakeholder.
 *
 *   GET  /api/projects/[id]/stakeholders/[sid]/interactions
 *     → { interactions: InteractionWithParticipants[] }
 *
 *   POST /api/projects/[id]/stakeholders/[sid]/interactions
 *     body: CreateInteractionInput
 *     → { interaction: InteractionWithParticipants }
 *
 * Soft-deleted rows (deleted_at != null) are filtered server-side.
 * Per-participant signal columns exist on the bridge but are NULL in α —
 * 34-β fuellt sie manuell, 34-γ via AI.
 */

import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"
import { CreateInteractionSchema } from "./_schema"

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

  // Find interaction-ids the stakeholder participates in, then load the
  // full interaction + all participants. Two-step prevents N+1 and keeps
  // the second join under control by the bridge index.
  const participantsRes = await supabase
    .from("stakeholder_interaction_participants")
    .select("interaction_id")
    .eq("project_id", projectId)
    .eq("stakeholder_id", sid)
    .limit(200)

  if (participantsRes.error) {
    return apiError("internal_error", participantsRes.error.message, 500)
  }

  const interactionIds = (participantsRes.data ?? []).map(
    (r) => r.interaction_id,
  )
  if (interactionIds.length === 0) {
    return Response.json({ interactions: [] })
  }

  const interactionsRes = await supabase
    .from("stakeholder_interactions")
    .select(
      "id, tenant_id, project_id, channel, direction, interaction_date, summary, awaiting_response, response_due_date, response_received_date, replies_to_interaction_id, created_by, source, source_context_id, created_at, updated_at, deleted_at",
    )
    .in("id", interactionIds)
    .is("deleted_at", null)
    .order("interaction_date", { ascending: false })
    .limit(200)

  if (interactionsRes.error) {
    return apiError("internal_error", interactionsRes.error.message, 500)
  }

  const survivingIds = (interactionsRes.data ?? []).map((r) => r.id)
  const allParticipantsRes =
    survivingIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("stakeholder_interaction_participants")
          .select(
            "interaction_id, stakeholder_id, participant_sentiment, participant_sentiment_source, participant_cooperation_signal, participant_cooperation_signal_source",
          )
          .in("interaction_id", survivingIds)

  if (allParticipantsRes.error) {
    return apiError("internal_error", allParticipantsRes.error.message, 500)
  }

  const byInteractionId = new Map<string, typeof allParticipantsRes.data>()
  for (const row of allParticipantsRes.data ?? []) {
    const list = byInteractionId.get(row.interaction_id) ?? []
    list.push(row)
    byInteractionId.set(row.interaction_id, list)
  }

  const interactions = (interactionsRes.data ?? []).map((interaction) => ({
    ...interaction,
    participants: byInteractionId.get(interaction.id) ?? [],
  }))

  return Response.json({ interactions })
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const { id: projectId, sid } = await ctx.params
  if (!UuidSchema.safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!UuidSchema.safeParse(sid).success) {
    return apiError("validation_error", "Invalid stakeholder id.", 400, "sid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // POST mutates → require manage access on the project. RLS would still
  // catch it, but a route-level 403 is cleaner for the UI.
  const access = await requireProjectAccess(
    supabase,
    projectId,
    userId,
    "edit",
  )
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }

  const parsed = CreateInteractionSchema.safeParse(body)
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

  // Verify the URL stakeholder belongs to this project (RLS would block
  // the FK insert, but a clean 404 is friendlier).
  const stakeholderRes = await supabase
    .from("stakeholders")
    .select("id, project_id, tenant_id")
    .eq("id", sid)
    .maybeSingle()
  if (stakeholderRes.error) {
    return apiError("internal_error", stakeholderRes.error.message, 500)
  }
  if (!stakeholderRes.data || stakeholderRes.data.project_id !== projectId) {
    return apiError("not_found", "Stakeholder not found.", 404, "sid")
  }
  const tenantId = stakeholderRes.data.tenant_id

  // Step 1: insert interaction row.
  const insertRes = await supabase
    .from("stakeholder_interactions")
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      channel: input.channel,
      direction: input.direction,
      interaction_date: input.interaction_date,
      summary: input.summary,
      awaiting_response: input.awaiting_response ?? false,
      response_due_date: input.response_due_date ?? null,
      replies_to_interaction_id: input.replies_to_interaction_id ?? null,
      created_by: userId,
      source: input.source ?? "manual",
      source_context_id: input.source_context_id ?? null,
    })
    .select(
      "id, tenant_id, project_id, channel, direction, interaction_date, summary, awaiting_response, response_due_date, response_received_date, replies_to_interaction_id, created_by, source, source_context_id, created_at, updated_at, deleted_at",
    )
    .single()

  if (insertRes.error) {
    if (insertRes.error.code === "P0003") {
      return apiError(
        "cross_project_reply",
        "Replies must stay within the same project.",
        400,
        "replies_to_interaction_id",
      )
    }
    return apiError("internal_error", insertRes.error.message, 500)
  }
  const interaction = insertRes.data

  // Step 2: assemble unique participant list — URL stakeholder always
  // included, plus any additional_participants. Dedup by stakeholder_id;
  // body values win on conflict.
  const seen = new Map<string, (typeof input)["additional_participants"][0]>()
  seen.set(sid, { stakeholder_id: sid })
  for (const p of input.additional_participants ?? []) {
    seen.set(p.stakeholder_id, p)
  }

  const participantRows = Array.from(seen.values()).map((p) => ({
    interaction_id: interaction.id,
    stakeholder_id: p.stakeholder_id,
    tenant_id: tenantId,
    project_id: projectId,
    participant_sentiment: p.participant_sentiment ?? null,
    participant_sentiment_source: p.participant_sentiment_source ?? null,
    participant_cooperation_signal: p.participant_cooperation_signal ?? null,
    participant_cooperation_signal_source:
      p.participant_cooperation_signal_source ?? null,
  }))

  const participantsInsertRes = await supabase
    .from("stakeholder_interaction_participants")
    .insert(participantRows)
    .select(
      "interaction_id, stakeholder_id, participant_sentiment, participant_sentiment_source, participant_cooperation_signal, participant_cooperation_signal_source",
    )

  if (participantsInsertRes.error) {
    // Cross-tenant / cross-project participant attempts surface via trigger.
    // Roll back the interaction so we don't orphan a row with no participants.
    await supabase
      .from("stakeholder_interactions")
      .delete()
      .eq("id", interaction.id)

    if (participantsInsertRes.error.code === "P0003") {
      return apiError(
        "cross_project_participant",
        "All participants must belong to the same project.",
        400,
        "additional_participants",
      )
    }
    return apiError(
      "internal_error",
      participantsInsertRes.error.message,
      500,
    )
  }

  return Response.json(
    {
      interaction: {
        ...interaction,
        participants: participantsInsertRes.data ?? [],
      },
    },
    { status: 201 },
  )
}
