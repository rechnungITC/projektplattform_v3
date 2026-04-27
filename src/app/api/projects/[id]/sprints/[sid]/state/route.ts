import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"

const schema = z.object({
  to_state: z.enum(["planned", "active", "closed"]),
})

/**
 * POST /api/projects/[id]/sprints/[sid]/state
 *
 * Transitions a sprint via the SECURITY DEFINER `set_sprint_state` function.
 * The function enforces:
 *   - role gate (tenant_admin / project_lead / project_editor)
 *   - allowed transitions (planned → active → closed)
 *   - single-active rule (only one sprint per project may be in `active`)
 *
 * Errors are mapped:
 *   23514 → 422 (illegal transition or single-active violation)
 *   42501 → 403 (role gate)
 *   02000 → 404 (sprint not found)
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; sid: string }> }
) {
  const { id: projectId, sid: sprintId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(sprintId).success) {
    return apiError("validation_error", "Invalid sprint id.", 400, "sid")
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

  // Verify the sprint belongs to the URL's project (defense against
  // sprint-id from another project): RLS will block the read if not a member.
  const { data: sprint, error: lookupErr } = await supabase
    .from("sprints")
    .select("id, project_id")
    .eq("id", sprintId)
    .maybeSingle()
  if (lookupErr) return apiError("internal_error", lookupErr.message, 500)
  if (!sprint) return apiError("not_found", "Sprint not found.", 404)
  if (sprint.project_id !== projectId) {
    return apiError("not_found", "Sprint not found in this project.", 404)
  }

  const { data, error } = await supabase.rpc("set_sprint_state", {
    p_sprint_id: sprintId,
    p_to_state: parsed.data.to_state,
  })

  if (error) {
    if (error.code === "23514") return apiError("invalid_transition", error.message, 422, "to_state")
    if (error.code === "42501") return apiError("forbidden", error.message, 403)
    if (error.code === "02000") return apiError("not_found", "Sprint not found.", 404)
    return apiError("transition_failed", error.message, 500)
  }
  return NextResponse.json({ result: data })
}
