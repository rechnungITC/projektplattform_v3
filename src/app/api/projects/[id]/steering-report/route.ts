import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import {
  logConfidentialReportRead,
  mustBlockOnLogFailure,
} from "@/lib/audit/confidential-read"
import { EMPTY_STEERING_REPORT, type SteeringReport } from "@/types/steering-report"

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

  const report = (data ?? EMPTY_STEERING_REPORT) as SteeringReport

  // PROJ-130-δ2: In-App-Lesen einer Auswertung — protokolliert wird NUR bei
  // `strict`. Die Stufe kommt aus der Auswertung selbst, weil
  // `stage_gate_summary` und `pre_read` über Objekte aggregieren, deren Stufen
  // in der Nutzlast nie einzeln erscheinen (aus der Nutzlast gerechnet würde der
  // Höchstwert unterberichten).
  const readLog = await logConfidentialReportRead(
    async (fn, args) => await supabase.rpc(fn, args),
    { projectId, report: "steering_report", surface: "view", payload: report }
  )
  if (mustBlockOnLogFailure(readLog)) {
    return apiError(
      "audit_log_failed",
      "Die Auswertung enthält streng vertrauliche Inhalte und konnte nicht protokolliert werden — sie wurde deshalb nicht ausgeliefert.",
      500
    )
  }

  return NextResponse.json(report)
}