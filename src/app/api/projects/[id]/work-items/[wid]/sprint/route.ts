import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"

const schema = z.object({
  sprint_id: z.string().uuid().nullable(),
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

  // Cross-project guard: if a sprint is supplied, ensure it belongs to the
  // same project. Without this, a malicious caller could attach a work item
  // to another project's sprint (RLS would block read of foreign sprints,
  // but the FK only enforces existence — not project match).
  if (parsed.data.sprint_id) {
    const { data: sprint, error: sprintErr } = await supabase
      .from("sprints")
      .select("id, project_id")
      .eq("id", parsed.data.sprint_id)
      .maybeSingle()
    if (sprintErr) return apiError("internal_error", sprintErr.message, 500)
    if (!sprint) return apiError("invalid_sprint", "Sprint not found.", 422, "sprint_id")
    if (sprint.project_id !== projectId) {
      return apiError(
        "invalid_sprint",
        "Sprint is not in this project.",
        422,
        "sprint_id"
      )
    }
  }

  const { data, error } = await supabase
    .from("work_items")
    .update({ sprint_id: parsed.data.sprint_id })
    .eq("id", workItemId)
    .eq("project_id", projectId)
    .select()
    .maybeSingle()
  if (error) {
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    if (error.code === "23503") return apiError("invalid_reference", error.message, 422)
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("update_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Work item not found.", 404)
  return NextResponse.json({ work_item: data })
}
