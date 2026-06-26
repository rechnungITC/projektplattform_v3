import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-114 — acknowledge a deal-breaker escalation (only the escalated-to user,
// enforced inside the RPC). POST .../dd-finding-escalations/[escId]/acknowledge

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; escId: string }> }
) {
  const { id: projectId, escId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(escId).success) {
    return apiError("validation_error", "Invalid escalation id.", 400, "escId")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase.rpc("acknowledge_dd_finding_escalation", {
    p_escalation_id: escId,
  })

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Only the escalated user can acknowledge.", 403)
    }
    if (error.code === "P0002") {
      return apiError("not_found", "Escalation not found.", 404)
    }
    return apiError("acknowledge_failed", error.message, 500)
  }

  return NextResponse.json({ escalation: data })
}
