import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-103 — Phasenübergreifende Aufgaben-/Engpass-Übersicht (read-only, live).
//
// GET /api/projects/[id]/task-bottlenecks
//
// Delegates to the SECURITY INVOKER RPC project_task_bottlenecks, which runs as
// the CALLER — so the RESTRICTIVE need-to-know policy on work_items filters rows
// before aggregation (a task the caller may not see appears in neither the
// table, the Top-3, nor the summary). MUST use the session-bound user client,
// NEVER service-role.

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

  const { data, error } = await supabase.rpc("project_task_bottlenecks", {
    p_project_id: projectId,
  })
  if (error) return apiError("overview_failed", error.message, 500)

  // RPC returns a jsonb { tasks: [...], top_bottlenecks: [...], summary: {...} }
  return NextResponse.json(
    data ?? {
      tasks: [],
      top_bottlenecks: [],
      summary: {
        open_total: 0,
        overdue_total: 0,
        due_today_total: 0,
        due_this_week_total: 0,
        blocked_total: 0,
      },
    }
  )
}
