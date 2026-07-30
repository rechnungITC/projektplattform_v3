import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { EMPTY_STEERING_REPORT } from "@/types/steering-report"

// PROJ-131 — Management-Reporting & Steering-Dashboard (read-only).
//
// GET /api/projects/[id]/steering-report
//
// Delegates to the SECURITY INVOKER RPC steering_report, which runs as the
// CALLER — so the RESTRICTIVE need-to-know policies on phases / ma_stage_gates /
// dd_findings / risks / work_items filter rows before aggregation (AC-131-2: a
// strict finding/risk/task appears in neither the lists nor the pre-read
// headline). MUST use the session-bound user client, NEVER service-role.

export async function GET(
  _request: Request,
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

  const { data, error } = await supabase.rpc("steering_report", {
    p_project_id: projectId,
  })
  if (error) return apiError("overview_failed", error.message, 500)

  return NextResponse.json(data ?? EMPTY_STEERING_REPORT)
}