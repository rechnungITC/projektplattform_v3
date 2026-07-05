import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-105 α — the active approver approves/rejects the current stage via
// record_deliverable_approval_response. The acting user is derived from the
// session (auth.uid()) inside the RPC — never passed as a parameter (H2).

const respondSchema = z.object({
  stage_id: z.string().uuid(),
  response: z.enum(["approve", "reject"]),
  comment: z.string().max(4000).optional(),
})

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; did: string }> }
) {
  const { id: projectId, did } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(did).success) {
    return apiError("validation_error", "Invalid deliverable id.", 400, "did")
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  // Any project member may reach the RPC; the RPC enforces that the caller is
  // the active-stage approver (and need-to-know for the deliverable).
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = respondSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(
      "validation_error",
      "stage_id (uuid) and response (approve|reject) are required.",
      400,
      "response"
    )
  }

  const { data, error } = await supabase.rpc(
    "record_deliverable_approval_response",
    {
      p_stage_id: parsed.data.stage_id,
      p_response: parsed.data.response,
      p_comment: parsed.data.comment ?? null,
    }
  )

  if (error) {
    if (error.code === "42501") return apiError("forbidden", error.message, 403)
    if (error.code === "P0002") return apiError("not_found", "Stage or approval not found.", 404)
    if (error.code === "22023") return apiError("invalid_state", error.message, 422)
    return apiError("respond_failed", error.message, 500)
  }
  return NextResponse.json({ approval: data })
}