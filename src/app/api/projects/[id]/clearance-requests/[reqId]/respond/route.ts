import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-100c — a named approver records approve/reject on a clearance request.
//
// POST /api/projects/[id]/clearance-requests/[reqId]/respond  { action }
//
// Delegates to record_clearance_approval_response, which enforces: request is
// pending, caller is a named approver, SoD (caller != requester), one vote per
// approver. On quorum it grants the clearance via the system-grant path.

const bodySchema = z.object({ action: z.enum(["approve", "reject"]) })

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; reqId: string }> }
) {
  const { id: projectId, reqId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(reqId).success) {
    return apiError("validation_error", "Invalid request id.", 400, "reqId")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { data, error } = await supabase.rpc("record_clearance_approval_response", {
    p_request_id: reqId,
    p_action: parsed.data.action,
  })

  if (error) {
    if (error.code === "42501") {
      // not an eligible approver, or the requester trying to self-approve (SoD)
      return apiError("forbidden", "Not authorized to respond to this request.", 403)
    }
    if (error.code === "P0002") {
      return apiError("not_found", "Request not found.", 404)
    }
    if (error.code === "22023") {
      return apiError("conflict", "Request is not pending.", 409)
    }
    if (error.code === "23505") {
      return apiError("conflict", "You have already responded to this request.", 409)
    }
    return apiError("respond_failed", error.message, 500)
  }

  return NextResponse.json({ request: data })
}
