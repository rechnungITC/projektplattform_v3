import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { transitionDdStreamSchema } from "../../_schema"

// PROJ-112 — DD-stream status transition.
//
// POST /api/projects/[id]/dd-streams/[streamId]/status  { to_status, comment? }
//
// Goes through transition_dd_stream_status (SECURITY DEFINER state machine).
// Authority (tenant-admin or project-lead) + state-machine validity are enforced
// inside the RPC; we pre-check manage_members for a clean 403 and map RPC error
// codes (42501 -> 403, 23514/22023 -> 400, P0002 -> 404).

export async function POST(
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
  const parsed = transitionDdStreamSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { data, error } = await supabase.rpc("transition_dd_stream_status", {
    p_stream_id: streamId,
    p_to_status: parsed.data.to_status,
    p_comment: parsed.data.comment ?? null,
  })

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Not authorized to change this stream.", 403)
    }
    if (error.code === "P0002") {
      return apiError("not_found", "Stream not found.", 404)
    }
    if (error.code === "23514" || error.code === "22023") {
      return apiError("validation_error", error.message, 400, "to_status")
    }
    return apiError("transition_failed", error.message, 500)
  }

  return NextResponse.json({ stream: data })
}
