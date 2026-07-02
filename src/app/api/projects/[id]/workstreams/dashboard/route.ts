import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-102 — workstream dashboard aggregates (AC3): per-workstream task
// progress + open risks. Backed by the SECURITY-INVOKER RPC
// workstream_dashboard(project): need-to-know is enforced by the caller's RLS
// context (a locked workstream / its tasks / risks simply aren't counted).
// deliverables_total is null until PROJ-104 (UI renders "—").

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

  const { data, error } = await supabase.rpc("workstream_dashboard", {
    p_project_id: projectId,
  })

  if (error) return apiError("dashboard_failed", error.message, 500)
  return NextResponse.json({ rows: data ?? [] })
}
