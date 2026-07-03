import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { transitionDeliverableSchema } from "../../_schema"

// PROJ-104 — deliverable status transition via transition_deliverable_status
// (state machine; `approved` is owned by PROJ-105 and rejected here).

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; did: string }> }
) {
  const { id: projectId, did } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(did).success) {
    return apiError("validation_error", "Invalid deliverable id.", 400, "did")
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
  const parsed = transitionDeliverableSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(
      "validation_error",
      "to_status must be planned/in_progress/in_review/suspended (approved is set via PROJ-105).",
      400,
      "to_status"
    )
  }

  const { data, error } = await supabase.rpc("transition_deliverable_status", {
    p_deliverable_id: did,
    p_to_status: parsed.data.to_status,
  })

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    if (error.code === "P0002") return apiError("not_found", "Deliverable not found.", 404)
    if (error.code === "23514") return apiError("invalid_transition", error.message, 422)
    if (error.code === "22023") return apiError("validation_error", error.message, 400)
    return apiError("transition_failed", error.message, 500)
  }
  return NextResponse.json({ deliverable: data })
}
