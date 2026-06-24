import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { DD_STREAM_SELECT, updateDdStreamSchema } from "../_schema"

// PROJ-112 — single DD-stream management (tenant-admin or project lead).
//
// PATCH  /api/projects/[id]/dd-streams/[streamId]  — edit fields (lead, window,
//        scope, confidentiality, phase link, sort). Status is NOT editable here
//        — it goes through the transition RPC (.../status).
// DELETE /api/projects/[id]/dd-streams/[streamId]  — remove the stream.

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; streamId: string }> }
) {
  const { id: projectId, streamId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(streamId).success) {
    return apiError("validation_error", "Invalid stream id.", 400, "streamId")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(
    supabase,
    projectId,
    userId,
    "manage_members"
  )
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = updateDdStreamSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const patch: Record<string, unknown> = {}
  const d = parsed.data
  if (d.label !== undefined) patch.label = d.label
  if (d.stream_lead_user_id !== undefined)
    patch.stream_lead_user_id = d.stream_lead_user_id
  if (d.planned_start !== undefined) patch.planned_start = d.planned_start
  if (d.planned_end !== undefined) patch.planned_end = d.planned_end
  if (d.scope !== undefined) patch.scope = d.scope
  if (d.notes !== undefined) patch.notes = d.notes
  if (d.confidentiality_level !== undefined)
    patch.confidentiality_level = d.confidentiality_level
  if (d.phase_id !== undefined) patch.phase_id = d.phase_id
  if (d.sort_order !== undefined) patch.sort_order = d.sort_order

  const { data, error } = await supabase
    .from("dd_streams")
    .update(patch)
    .eq("id", streamId)
    .eq("project_id", projectId)
    .select(DD_STREAM_SELECT)
    .maybeSingle()

  if (error) {
    if (error.code === "23503") {
      return apiError("validation_error", "Unknown phase or user.", 400)
    }
    return apiError("update_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Stream not found.", 404)

  return NextResponse.json({ stream: data })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; streamId: string }> }
) {
  const { id: projectId, streamId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(streamId).success) {
    return apiError("validation_error", "Invalid stream id.", 400, "streamId")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(
    supabase,
    projectId,
    userId,
    "manage_members"
  )
  if (access.error) return access.error

  const { error } = await supabase
    .from("dd_streams")
    .delete()
    .eq("id", streamId)
    .eq("project_id", projectId)

  if (error) return apiError("delete_failed", error.message, 500)
  return NextResponse.json({ ok: true })
}
