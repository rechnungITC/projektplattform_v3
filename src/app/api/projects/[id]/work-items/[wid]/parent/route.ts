import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import { ALLOWED_PARENT_KINDS, type WorkItemKind } from "@/types/work-item"

const schema = z.object({
  parent_id: z.string().uuid().nullable(),
})

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; wid: string }> }
) {
  const { id: projectId, wid: workItemId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(workItemId).success) {
    return apiError("validation_error", "Invalid work item id.", 400, "wid")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be JSON.", 400)
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const f = parsed.error.issues[0]
    return apiError(
      "validation_error",
      f?.message ?? "Invalid body.",
      400,
      f?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // Read the child's kind for parent-rule validation.
  const { data: child, error: childErr } = await supabase
    .from("work_items")
    .select("id, kind, project_id")
    .eq("id", workItemId)
    .eq("project_id", projectId)
    .maybeSingle()
  if (childErr) return apiError("internal_error", childErr.message, 500)
  if (!child) return apiError("not_found", "Work item not found.", 404)

  const childKind = child.kind as WorkItemKind

  if (parsed.data.parent_id === null) {
    if (!ALLOWED_PARENT_KINDS[childKind].includes(null)) {
      return apiError(
        "invalid_parent_kind",
        `${childKind} requires a parent.`,
        422,
        "parent_id"
      )
    }
  } else {
    if (parsed.data.parent_id === workItemId) {
      return apiError("invalid_parent", "An item cannot be its own parent.", 422, "parent_id")
    }
    const { data: parent, error: parentErr } = await supabase
      .from("work_items")
      .select("id, kind, project_id, is_deleted")
      .eq("id", parsed.data.parent_id)
      .maybeSingle()
    if (parentErr) return apiError("internal_error", parentErr.message, 500)
    if (!parent) return apiError("invalid_parent", "Parent not found.", 422, "parent_id")
    if (parent.project_id !== projectId) {
      return apiError("invalid_parent", "Parent is not in this project.", 422, "parent_id")
    }
    if (parent.is_deleted) {
      return apiError("invalid_parent", "Parent is deleted.", 422, "parent_id")
    }
    if (!ALLOWED_PARENT_KINDS[childKind].includes(parent.kind as WorkItemKind)) {
      return apiError(
        "invalid_parent_kind",
        `${childKind} cannot have a ${parent.kind} parent.`,
        422,
        "parent_id"
      )
    }
  }

  const { data, error } = await supabase
    .from("work_items")
    .update({ parent_id: parsed.data.parent_id })
    .eq("id", workItemId)
    .eq("project_id", projectId)
    .select()
    .maybeSingle()
  if (error) {
    if (error.code === "23514") {
      // Cycle prevention trigger raises check_violation.
      return apiError(
        "cycle_detected",
        "This change would create a cycle in the parent chain.",
        422,
        "parent_id"
      )
    }
    if (error.code === "23503") return apiError("invalid_reference", error.message, 422)
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("update_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Work item not found.", 404)
  return NextResponse.json({ work_item: data })
}
