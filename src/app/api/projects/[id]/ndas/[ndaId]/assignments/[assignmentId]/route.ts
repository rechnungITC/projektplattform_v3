import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-128 — remove an NDA assignment (manager-gated). Removing a user_id row
// withdraws the NDA coverage that the gate depends on.

export async function DELETE(
  request: Request,
  context: {
    params: Promise<{ id: string; ndaId: string; assignmentId: string }>
  }
) {
  const { id: projectId, ndaId, assignmentId } = await context.params
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(ndaId).success ||
    !z.string().uuid().safeParse(assignmentId).success
  ) {
    return apiError("validation_error", "Invalid id.", 400)
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

  const { data, error } = await supabase
    .from("ma_nda_assignments")
    .delete()
    .eq("id", assignmentId)
    .eq("nda_id", ndaId)
    .eq("project_id", projectId)
    .select("id")
    .maybeSingle()

  if (error) return apiError("delete_failed", error.message, 500)
  if (!data) return apiError("not_found", "Assignment not found.", 404)
  return NextResponse.json({ deleted: true, id: data.id })
}
