import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-100a — revoke a need-to-know clearance.
// DELETE /api/projects/[id]/clearances/[userId]
// The revoke_confidentiality_clearance RPC enforces authority + writes the
// audit row; requireProjectAccess gives a clean 403 first.

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; userId: string }> }
) {
  const { id: projectId, userId: targetUserId } = await context.params

  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(targetUserId).success) {
    return apiError("validation_error", "Invalid user id.", 400, "userId")
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

  const { error } = await supabase.rpc("revoke_confidentiality_clearance", {
    p_project_id: projectId,
    p_user_id: targetUserId,
  })

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Only project leads or tenant admins can revoke clearances.",
        403
      )
    }
    if (error.code === "P0002") {
      return apiError("not_found", "Project not found.", 404)
    }
    return apiError("revoke_failed", error.message, 500)
  }

  return NextResponse.json({ ok: true })
}
