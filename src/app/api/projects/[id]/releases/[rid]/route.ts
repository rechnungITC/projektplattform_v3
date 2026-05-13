import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
} from "@/app/api/_lib/route-helpers"

import {
  normalizeReleasePayload,
  releasePatchSchema as updateSchema,
} from "../_schema"
import {
  requireReleaseProject,
  validateTargetMilestone,
  validateUuid,
} from "../_helpers"

function validateIds(projectId: string, releaseId: string) {
  return (
    validateUuid(projectId, "id", "project id") ??
    validateUuid(releaseId, "rid", "release id")
  )
}

// -----------------------------------------------------------------------------
// GET /api/projects/[id]/releases/[rid] -- release detail
// -----------------------------------------------------------------------------
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; rid: string }> }
) {
  const { id: projectId, rid: releaseId } = await context.params
  const idError = validateIds(projectId, releaseId)
  if (idError) return idError

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const projectResult = await requireReleaseProject(
    supabase,
    projectId,
    userId,
    "view"
  )
  if (projectResult.error) return projectResult.error

  const { data, error } = await supabase
    .from("releases")
    .select("*")
    .eq("id", releaseId)
    .eq("project_id", projectId)
    .maybeSingle()

  if (error) return apiError("internal_error", error.message, 500)
  if (!data) return apiError("not_found", "Release not found.", 404)
  return NextResponse.json({ release: data })
}

// -----------------------------------------------------------------------------
// PATCH /api/projects/[id]/releases/[rid] -- update release master data
// -----------------------------------------------------------------------------
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; rid: string }> }
) {
  const { id: projectId, rid: releaseId } = await context.params
  const idError = validateIds(projectId, releaseId)
  if (idError) return idError

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be JSON.", 400)
  }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return apiError(
      "validation_error",
      issue?.message ?? "Invalid body.",
      400,
      issue?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const projectResult = await requireReleaseProject(
    supabase,
    projectId,
    userId,
    "edit"
  )
  if (projectResult.error) return projectResult.error

  const milestoneError = await validateTargetMilestone(
    supabase,
    projectId,
    parsed.data.target_milestone_id
  )
  if (milestoneError) return milestoneError

  const { data, error } = await supabase
    .from("releases")
    .update(normalizeReleasePayload(parsed.data))
    .eq("id", releaseId)
    .eq("project_id", projectId)
    .select()
    .maybeSingle()

  if (error) {
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    if (error.code === "23503") {
      return apiError("invalid_reference", error.message, 422)
    }
    if (error.code === "42501") {
      return apiError("forbidden", "Not allowed.", 403)
    }
    return apiError("update_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Release not found.", 404)
  return NextResponse.json({ release: data })
}
