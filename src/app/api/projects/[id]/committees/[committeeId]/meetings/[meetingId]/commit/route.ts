import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { commitMinutesSchema } from "../../_schema"

// PROJ-117 — commit meeting minutes atomically (commit_meeting_minutes RPC):
// each resolution → a NEUTRAL PROJ-20 decision, each action → a PROJ-101 task,
// with reverse-link outcomes. Authority + clearance enforced in the RPC.
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; committeeId: string; meetingId: string }> }
) {
  const { id: projectId, meetingId } = await context.params
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(meetingId).success
  ) {
    return apiError("validation_error", "Invalid id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = commitMinutesSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError("validation_error", first?.message ?? "Invalid body.", 400, first?.path?.[0]?.toString())
  }

  const { data, error } = await supabase.rpc("commit_meeting_minutes", {
    p_meeting_id: meetingId,
    p_decisions: parsed.data.decisions ?? [],
    p_actions: parsed.data.actions ?? [],
  })
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not authorized to commit minutes.", 403)
    if (error.code === "P0002") return apiError("not_found", "Meeting not found.", 404)
    if (error.code === "22023") return apiError("validation_error", error.message, 400)
    return apiError("commit_failed", error.message, 500)
  }
  return NextResponse.json(data)
}
