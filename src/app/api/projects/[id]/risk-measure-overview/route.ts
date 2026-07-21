import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-109 — Maßnahmen-Übersicht (read-only, live).
//
// GET /api/projects/[id]/risk-measure-overview
//
// Delegates to the SECURITY INVOKER RPC risk_measure_overview, which runs as
// the CALLER — so the RESTRICTIVE need-to-know policies on risks / work_items
// filter rows before aggregation (a user only sees measures for risks they may
// see). MUST use the session-bound user client, NEVER service-role.

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

  const { data, error } = await supabase.rpc("risk_measure_overview", {
    p_project_id: projectId,
  })
  if (error) return apiError("overview_failed", error.message, 500)

  // RPC returns a jsonb { risks: [...], summary: {...} }
  return NextResponse.json(
    data ?? {
      risks: [],
      summary: {
        risk_total: 0,
        active_total: 0,
        active_uncovered: 0,
        measure_total: 0,
      },
    }
  )
}
