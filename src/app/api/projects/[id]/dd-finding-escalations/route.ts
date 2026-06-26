import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-114 — deal-breaker escalations for a project (project members; RLS +
// need-to-know gate scope rows). GET /api/projects/[id]/dd-finding-escalations
// [?open=1] (open = not yet acknowledged).

const ESC_SELECT =
  "id, tenant_id, project_id, finding_id, escalated_to_user_id, role, confidentiality_level, escalated_at, acknowledged_at"

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
    .from("dd_finding_escalations")
    .select(ESC_SELECT)
    .eq("project_id", projectId)
  const onlyOpen = new URL(request.url).searchParams.get("open") === "1"
  const filtered = onlyOpen ? base.is("acknowledged_at", null) : base

  const { data, error } = await filtered
    .order("escalated_at", { ascending: false })
    .limit(500)
  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ escalations: data ?? [] })
}
