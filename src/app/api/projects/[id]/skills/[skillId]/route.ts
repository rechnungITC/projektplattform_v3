import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-78 — Einzelne Skill-Zuordnung entfernen.
//
// DELETE /api/projects/[id]/skills/[skillId]
//
// Schreiben = Projektleitung oder Tenant-Admin. Das Entfernen einer
// automatisch aufgelösten Zuordnung ist erlaubt und wird in der RPC als
// manuelle Übersteuerung im Audit gekennzeichnet (Spec-AC).

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; skillId: string }> }
) {
  const { id: projectId, skillId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(skillId).success) {
    return apiError("validation_error", "Invalid skill id.", 400, "skillId")
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

  const { error } = await supabase.rpc("remove_project_skill", {
    p_project_id: projectId,
    p_skill_id: skillId,
  })

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", error.message, 403)
    }
    if (error.code === "P0002") {
      return apiError("not_found", error.message, 404)
    }
    return apiError("remove_failed", error.message, 500)
  }

  return new NextResponse(null, { status: 204 })
}
