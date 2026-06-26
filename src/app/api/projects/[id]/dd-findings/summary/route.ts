import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-114 — DD-Findings aggregate (per stream/severity: count + EUR sum +
// null_eur_count). SECURITY INVOKER RPC → the need-to-know gate applies to the
// caller, so the aggregate never reveals more than the caller may see.
// GET /api/projects/[id]/dd-findings/summary

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

  const { data, error } = await supabase.rpc("dd_findings_summary", {
    p_project_id: projectId,
  })
  if (error) return apiError("summary_failed", error.message, 500)
  return NextResponse.json({ summary: data ?? [] })
}
