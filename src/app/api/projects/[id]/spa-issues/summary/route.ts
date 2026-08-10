import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-122 — GET /api/projects/[id]/spa-issues/summary
// Status counts for the list header and the "open issues" hint.
//
// Backed by spa_issues_summary, which is SECURITY INVOKER: the aggregate is
// computed under the caller's own RLS, so a member without clearance can never
// infer the existence of confidential issues from the counts
// (aggregate-leak probe, pentest case I).

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

  const { data, error } = await supabase.rpc("spa_issues_summary", {
    p_project_id: projectId,
  })
  if (error) return apiError("summary_failed", error.message, 500)

  return NextResponse.json({ summary: data ?? [] })
}
