import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { computeRules } from "@/lib/project-rules/engine"
import type { ProjectMethod } from "@/types/project-method"
import type { ProjectType } from "@/types/project"

/**
 * GET /api/projects/[id]/rules — per-project rule resolution (PROJ-6).
 * Reads the stored project_type + project_method and runs the engine.
 * Used by the project-room layout to gate tabs and the planning views.
 *
 * Auth: project view (PROJ-4 `requireProjectAccess`, action `view`).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params

  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("projects")
    .select("project_type, project_method")
    .eq("id", projectId)
    .maybeSingle()

  if (error) {
    return apiError("internal_error", error.message, 500)
  }
  if (!data) {
    return apiError("not_found", "Project not found.", 404)
  }

  const type = (data as { project_type: ProjectType }).project_type
  const method = (data as { project_method: ProjectMethod | null })
    .project_method
  const rules = computeRules(type, method)

  return NextResponse.json(
    { project_id: projectId, type, method, rules },
    { status: 200 }
  )
}
