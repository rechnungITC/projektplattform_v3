/**
 * PROJ-34-α — Single interaction CRUD.
 *
 *   GET    /api/projects/[id]/interactions/[iid]
 *     → { interaction: InteractionWithParticipants }
 *
 *   PATCH  /api/projects/[id]/interactions/[iid]
 *     body: UpdateInteractionInput
 *     → { interaction: InteractionWithParticipants }
 *
 *   DELETE /api/projects/[id]/interactions/[iid]
 *     → 204; Soft-Delete via `deleted_at`. DSGVO-Hard-Delete folgt in 34-ε.
 *
 * Interaction lives at the project layer (not stakeholder layer) because
 * one interaction can involve multiple stakeholders. The participants
 * collection is updated separately via dedicated routes (deferred to β).
 */

import type { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
  type ApiErrorBody,
} from "../../../../_lib/route-helpers"
import { UpdateInteractionSchema } from "../../stakeholders/[sid]/interactions/_schema"

interface Ctx {
  params: Promise<{ id: string; iid: string }>
}

interface InteractionWithParticipants {
  id: string
  tenant_id: string
  project_id: string
  channel: string
  direction: string
  interaction_date: string
  summary: string
  awaiting_response: boolean
  response_due_date: string | null
  response_received_date: string | null
  replies_to_interaction_id: string | null
  created_by: string | null
  source: string
  source_context_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  participants: Array<{
    interaction_id: string
    stakeholder_id: string
    participant_sentiment: number | null
    participant_sentiment_source: string | null
    participant_cooperation_signal: number | null
    participant_cooperation_signal_source: string | null
  }>
}

type LoadResult =
  | { kind: "error"; response: NextResponse<ApiErrorBody> }
  | { kind: "ok"; interaction: InteractionWithParticipants }

const UuidSchema = z.string().uuid()

async function loadInteractionForProject(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  projectId: string,
  interactionId: string,
): Promise<LoadResult> {
  const interactionRes = await supabase
    .from("stakeholder_interactions")
    .select(
      "id, tenant_id, project_id, channel, direction, interaction_date, summary, awaiting_response, response_due_date, response_received_date, replies_to_interaction_id, created_by, source, source_context_id, created_at, updated_at, deleted_at",
    )
    .eq("id", interactionId)
    .eq("project_id", projectId)
    .maybeSingle()

  if (interactionRes.error) {
    return {
      kind: "error",
      response: apiError("internal_error", interactionRes.error.message, 500),
    }
  }
  if (!interactionRes.data) {
    return {
      kind: "error",
      response: apiError("not_found", "Interaction not found.", 404),
    }
  }

  const participantsRes = await supabase
    .from("stakeholder_interaction_participants")
    .select(
      "interaction_id, stakeholder_id, participant_sentiment, participant_sentiment_source, participant_cooperation_signal, participant_cooperation_signal_source",
    )
    .eq("interaction_id", interactionId)

  if (participantsRes.error) {
    return {
      kind: "error",
      response: apiError("internal_error", participantsRes.error.message, 500),
    }
  }

  return {
    kind: "ok",
    interaction: {
      ...interactionRes.data,
      participants: participantsRes.data ?? [],
    },
  }
}

export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { id: projectId, iid } = await ctx.params
  if (!UuidSchema.safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!UuidSchema.safeParse(iid).success) {
    return apiError("validation_error", "Invalid interaction id.", 400, "iid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const result = await loadInteractionForProject(supabase, projectId, iid)
  if (result.kind === "error") return result.response

  if (result.interaction.deleted_at) {
    return apiError("not_found", "Interaction not found.", 404)
  }

  return Response.json({ interaction: result.interaction })
}

export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  const { id: projectId, iid } = await ctx.params
  if (!UuidSchema.safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!UuidSchema.safeParse(iid).success) {
    return apiError("validation_error", "Invalid interaction id.", 400, "iid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
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

  const parsed = UpdateInteractionSchema.safeParse(body)
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

  // Only forward fields the route accepts; participants are not editable
  // through this endpoint in α (deferred to β participant-edit slice).
  const update: Record<string, unknown> = {}
  if (input.channel !== undefined) update.channel = input.channel
  if (input.direction !== undefined) update.direction = input.direction
  if (input.interaction_date !== undefined)
    update.interaction_date = input.interaction_date
  if (input.summary !== undefined) update.summary = input.summary
  if (input.awaiting_response !== undefined)
    update.awaiting_response = input.awaiting_response
  if (input.response_due_date !== undefined)
    update.response_due_date = input.response_due_date
  if (input.response_received_date !== undefined)
    update.response_received_date = input.response_received_date
  if (input.replies_to_interaction_id !== undefined)
    update.replies_to_interaction_id = input.replies_to_interaction_id

  if (Object.keys(update).length === 0) {
    return apiError("validation_error", "No updatable fields provided.", 400)
  }

  const updateRes = await supabase
    .from("stakeholder_interactions")
    .update(update)
    .eq("id", iid)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle()

  if (updateRes.error) {
    if (updateRes.error.code === "P0003") {
      return apiError(
        "cross_project_reply",
        "Replies must stay within the same project.",
        400,
        "replies_to_interaction_id",
      )
    }
    return apiError("internal_error", updateRes.error.message, 500)
  }
  if (!updateRes.data) {
    return apiError("not_found", "Interaction not found.", 404)
  }

  const result = await loadInteractionForProject(supabase, projectId, iid)
  if (result.kind === "error") return result.response
  return Response.json({ interaction: result.interaction })
}

export async function DELETE(_request: Request, ctx: Ctx): Promise<Response> {
  const { id: projectId, iid } = await ctx.params
  if (!UuidSchema.safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!UuidSchema.safeParse(iid).success) {
    return apiError("validation_error", "Invalid interaction id.", 400, "iid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(
    supabase,
    projectId,
    userId,
    "edit",
  )
  if (access.error) return access.error

  // Soft-Delete: deleted_at-Spalte setzen. DSGVO-Hard-Delete folgt in 34-ε
  // mit cascade-cleanup auf coaching_recommendations.
  const softDeleteRes = await supabase
    .from("stakeholder_interactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", iid)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle()

  if (softDeleteRes.error) {
    return apiError("internal_error", softDeleteRes.error.message, 500)
  }
  if (!softDeleteRes.data) {
    return apiError("not_found", "Interaction not found.", 404)
  }

  return new Response(null, { status: 204 })
}
