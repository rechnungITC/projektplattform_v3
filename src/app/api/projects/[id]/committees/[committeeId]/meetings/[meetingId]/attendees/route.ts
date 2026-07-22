import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { setAttendeeSchema } from "../../_schema"

// PROJ-117 — set (upsert) a meeting attendee via set_meeting_attendee RPC.
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
  const parsed = setAttendeeSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError("validation_error", first?.message ?? "Invalid body.", 400, first?.path?.[0]?.toString())
  }

  const { data, error } = await supabase.rpc("set_meeting_attendee", {
    p_meeting_id: meetingId,
    p_stakeholder_id: parsed.data.stakeholder_id,
    p_attendance: parsed.data.attendance ?? "present",
  })
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not authorized.", 403)
    if (error.code === "P0002") return apiError("not_found", "Meeting not found.", 404)
    if (error.code === "23503") return apiError("validation_error", "Stakeholder is not in this project.", 422, "stakeholder_id")
    if (error.code === "22023") return apiError("validation_error", error.message, 400)
    return apiError("create_failed", error.message, 500)
  }
  return NextResponse.json({ attendee: data }, { status: 201 })
}
