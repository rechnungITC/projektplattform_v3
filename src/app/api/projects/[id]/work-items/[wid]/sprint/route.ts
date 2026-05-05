import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

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

  // Defense-in-depth: surface a clean 403 before relying on RLS row-level
  // filters. Caller must hold an edit role on the project.
  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  // Cross-project guard + sprint-state guard. If a sprint is supplied, ensure
  // it belongs to the same project (FK only enforces existence, not project
  // match) and reject closed sprints — a closed sprint is a frozen historical
  // artifact, attaching new work items to it would corrupt velocity reports.
  // PROJ-25b adds the closed-state check (was tech-debt from PROJ-7).
  if (parsed.data.sprint_id) {
    const { data: sprint, error: sprintErr } = await supabase
      .from("sprints")
      .select("id, project_id, state")
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
    if (sprint.state === "closed") {
      return apiError(
        "sprint_closed",
        "Cannot assign work items to a closed sprint.",
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
