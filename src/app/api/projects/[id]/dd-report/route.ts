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
import { EMPTY_DD_REPORT, type DdReport } from "@/lib/ma-project/dd-findings-api"

// PROJ-116 — consolidated DD report + red-flag report (read-only, live).
//
// GET /api/projects/[id]/dd-report
//
// Delegates to the SECURITY INVOKER RPC dd_report_consolidated, which runs as
// the CALLER — so the RESTRICTIVE need-to-know policies on dd_streams /
// dd_findings / dd_questions filter rows before aggregation (AC4: an advisor
// only sees cleared streams/findings). H2: this route MUST use the
// session-bound user client (getAuthenticatedUserId), NEVER service-role.

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

  const { data, error } = await supabase.rpc("dd_report_consolidated", {
    p_project_id: projectId,
  })
  if (error) return apiError("report_failed", error.message, 500)

  // RPC returns a jsonb { streams: [...], red_flags: [...], confidentiality: {...} }
  const report = (data ?? EMPTY_DD_REPORT) as DdReport

  // PROJ-130-δ2: In-App-Lesen einer Auswertung — protokolliert wird NUR bei
  // `strict`. Die Stufe kommt aus der Auswertung selbst (Schlüssel
  // `confidentiality`), nicht aus der Nutzlast: die Zähler in `streams`
  // aggregieren über Findings und Fragen, deren Stufen nie einzeln erscheinen.
  const readLog = await logConfidentialReportRead(
    async (fn, args) => await supabase.rpc(fn, args),
    { projectId, report: "dd_report", surface: "view", payload: report }
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
