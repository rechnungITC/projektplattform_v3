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
import {
  EMPTY_OPERATIVE_REPORT,
  type OperativeReport,
} from "@/types/operative-report"

// PROJ-132 — Operatives Reporting für PMO, Deal Lead und Workstreams (read-only).
//
// GET /api/projects/[id]/operative-report
//
// Delegates to the SECURITY INVOKER RPC operative_report, which runs as the
// CALLER — so the RESTRICTIVE need-to-know policies on work_items / dd_findings /
// dd_questions / deliverables / dd_streams filter rows before aggregation
// (B4: an external advisor sees only their cleared stream; no aggregate leak).
// MUST use the session-bound user client, NEVER service-role.

// Die leere Nutzlast lag hier als untypisierte Kopie von EMPTY_OPERATIVE_REPORT.
// PROJ-130-δ2 nutzt die geteilte, TYPISIERTE Konstante: das neue Pflichtfeld
// `confidentiality` hätte die Kopie sonst still nicht mitbekommen.

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

  const { data, error } = await supabase.rpc("operative_report", {
    p_project_id: projectId,
  })
  if (error) return apiError("overview_failed", error.message, 500)

  const report = (data ?? EMPTY_OPERATIVE_REPORT) as OperativeReport

  // PROJ-130-δ2: In-App-Lesen einer Auswertung — protokolliert wird NUR bei
  // `strict`. Die Stufe kommt aus der Auswertung selbst; ihre Q&A- und
  // Finding-Abschnitte aggregieren zu Zählern, deren Stufen in der Nutzlast nie
  // einzeln erscheinen.
  const readLog = await logConfidentialReportRead(
    async (fn, args) => await supabase.rpc(fn, args),
    { projectId, report: "operative_report", surface: "view", payload: report }
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
