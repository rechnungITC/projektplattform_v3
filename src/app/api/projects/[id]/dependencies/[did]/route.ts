import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"

/**
 * DELETE /api/projects/[id]/dependencies/[did]
 *
 * Dependencies are immutable (no UPDATE policy in the migration). To "edit"
 * one, callers delete it and recreate. RLS allows editor or lead.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; did: string }> }
) {
  const { id: projectId, did: dependencyId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(dependencyId).success) {
    return apiError("validation_error", "Invalid dependency id.", 400, "did")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { error } = await supabase
    .from("dependencies")
    .delete()
    .eq("id", dependencyId)
    .eq("project_id", projectId)

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("delete_failed", error.message, 500)
  }
  return new NextResponse(null, { status: 204 })
}
