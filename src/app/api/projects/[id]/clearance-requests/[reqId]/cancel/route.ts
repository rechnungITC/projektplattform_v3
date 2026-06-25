import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-100c — cancel a pending clearance approval request.
//
// POST /api/projects/[id]/clearance-requests/[reqId]/cancel
//
// Delegates to cancel_clearance_grant_request (requester OR tenant-admin/
// project-lead). No clearance is created.

export async function POST(
  _request: Request,
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

  const { data, error } = await supabase.rpc("cancel_clearance_grant_request", {
    p_request_id: reqId,
  })

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Not authorized to cancel this request.", 403)
    }
    if (error.code === "P0002") {
      return apiError("not_found", "Request not found.", 404)
    }
    if (error.code === "22023") {
      return apiError("conflict", "Request is not pending.", 409)
    }
    return apiError("cancel_failed", error.message, 500)
  }

  return NextResponse.json({ request: data })
}
