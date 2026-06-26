import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-100c — list 4-eyes clearance approval requests for a project.
//
// GET /api/projects/[id]/clearance-requests[?status=pending]
//     Project members may read (governance transparency); RLS scopes rows.

const REQUEST_SELECT =
  "id, tenant_id, project_id, user_id, requested_level, applied_profile_id, valid_until, requested_by, quorum_required, status, granted_clearance_id, created_at, decided_at"

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const base = supabase
    .from("ma_clearance_grant_requests")
    .select(REQUEST_SELECT)
    .eq("project_id", projectId)

  const status = new URL(request.url).searchParams.get("status")
  const filtered =
    status && ["pending", "approved", "rejected", "cancelled"].includes(status)
      ? base.eq("status", status)
      : base

  const { data, error } = await filtered
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ requests: data ?? [] })
}
