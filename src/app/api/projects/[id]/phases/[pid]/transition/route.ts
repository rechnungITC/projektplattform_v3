import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"

const transitionSchema = z.object({
  to_status: z.enum(["planned", "in_progress", "completed", "cancelled"]),
  comment: z.string().max(500).optional().nullable(),
})

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; pid: string }> }
) {
  const { id: projectId, pid: phaseId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(phaseId).success) {
    return apiError("validation_error", "Invalid phase id.", 400, "pid")
  }

  let body: unknown
  try { body = await request.json() } catch { return apiError("invalid_body", "Body must be JSON.", 400) }
  const parsed = transitionSchema.safeParse(body)
  if (!parsed.success) {
    const f = parsed.error.issues[0]
    return apiError("validation_error", f?.message ?? "Invalid body.", 400, f?.path?.[0]?.toString())
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data, error } = await supabase.rpc("transition_phase_status", {
    p_phase_id: phaseId,
    p_to_status: parsed.data.to_status,
    p_comment: parsed.data.comment ?? null,
  })

  if (error) {
    if (error.code === "23514") return apiError("invalid_transition", error.message, 422)
    if (error.code === "42501") return apiError("forbidden", error.message, 403)
    if (error.code === "02000") return apiError("not_found", "Phase not found.", 404)
    return apiError("transition_failed", error.message, 500)
  }

  return NextResponse.json(data)
}
