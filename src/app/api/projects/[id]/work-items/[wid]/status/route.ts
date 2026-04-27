import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"

const STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled"] as const

const schema = z.object({
  status: z.enum(STATUSES),
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

  const { data, error } = await supabase
    .from("work_items")
    .update({ status: parsed.data.status })
    .eq("id", workItemId)
    .eq("project_id", projectId)
    .select()
    .maybeSingle()

  if (error) {
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("update_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Work item not found.", 404)
  return NextResponse.json({ work_item: data })
}
