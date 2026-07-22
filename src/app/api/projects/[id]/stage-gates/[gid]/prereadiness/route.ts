import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-110 — pre-read readiness counts for a gate (AC2/AC3). The RPC is
// SECURITY INVOKER, so need-to-know RLS applies to the caller (findings the
// caller can't see are not counted).
// GET /api/projects/[id]/stage-gates/[gid]/prereadiness

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; gid: string }> }
) {
  const { id: projectId, gid } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(gid).success) {
    return apiError("validation_error", "Invalid gate id.", 400, "gid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase.rpc("stage_gate_prereadiness", {
    p_gate_id: gid,
  })
  if (error) return apiError("prereadiness_failed", error.message, 500)
  if (data === null) return apiError("not_found", "Stage gate not found.", 404)
  return NextResponse.json({ prereadiness: data })
}
