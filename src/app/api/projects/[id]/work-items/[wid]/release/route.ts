import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

const schema = z.object({
  release_id: z.string().uuid().nullable(),
})

const RELEASE_ASSIGNABLE_KINDS = new Set(["story", "task", "bug"])

function validateIds(projectId: string, workItemId: string) {
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(workItemId).success) {
    return apiError("validation_error", "Invalid work item id.", 400, "wid")
  }
  return null
}

// -----------------------------------------------------------------------------
// PATCH /api/projects/[id]/work-items/[wid]/release -- assign release scope
// -----------------------------------------------------------------------------
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; wid: string }> }
) {
  const { id: projectId, wid: workItemId } = await context.params
  const idError = validateIds(projectId, workItemId)
  if (idError) return idError

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be JSON.", 400)
  }

  const parsed = schema.safeParse(body)
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

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  if (parsed.data.release_id) {
    const { data: release, error: releaseError } = await supabase
      .from("releases")
      .select("id, project_id, status")
      .eq("id", parsed.data.release_id)
      .maybeSingle()

    if (releaseError) {
      return apiError("internal_error", releaseError.message, 500)
    }
    if (!release) {
      return apiError(
        "invalid_release",
        "Release not found.",
        422,
        "release_id"
      )
    }
    if (release.project_id !== projectId) {
      return apiError(
        "invalid_release",
        "Release is not in this project.",
        422,
        "release_id"
      )
    }
    if (release.status === "archived") {
      return apiError(
        "release_archived",
        "Cannot assign work items to an archived release.",
        422,
        "release_id"
      )
    }
  }

  const { data: workItem, error: workItemError } = await supabase
    .from("work_items")
    .select("id, kind, is_deleted")
    .eq("id", workItemId)
    .eq("project_id", projectId)
    .maybeSingle()

  if (workItemError) {
    return apiError("internal_error", workItemError.message, 500)
  }
  if (!workItem || workItem.is_deleted) {
    return apiError("not_found", "Work item not found.", 404)
  }
  if (!RELEASE_ASSIGNABLE_KINDS.has(workItem.kind)) {
    return apiError(
      "invalid_kind",
      "Only stories, tasks and bugs can be assigned to a release.",
      422,
      "wid"
    )
  }

  const { data, error } = await supabase
    .from("work_items")
    .update({ release_id: parsed.data.release_id })
    .eq("id", workItemId)
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
  if (!data) return apiError("not_found", "Work item not found.", 404)
  return NextResponse.json({ work_item: data })
}
