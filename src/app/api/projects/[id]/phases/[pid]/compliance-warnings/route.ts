import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import { resolvePhaseWarnings } from "@/lib/compliance/phase-warnings"

// -----------------------------------------------------------------------------
// GET /api/projects/[id]/phases/[pid]/compliance-warnings
//
// Surfaces compliance gaps before closing a phase. v1 logic:
//   1. For every work-item in this phase with at least one tag attached,
//      where status != 'done': emit one warning per (work-item, tag) pair
//      indicating the parent isn't compliance-complete.
//   2. (Future) integrate per-checklist signal once compliance forms expose
//      their completion state.
// -----------------------------------------------------------------------------
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; pid: string }> }
) {
  const { id: projectId, pid: phaseId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(phaseId).success) {
    return apiError("validation_error", "Invalid phase id.", 400, "pid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  try {
    const warnings = await resolvePhaseWarnings({
      supabase,
      projectId,
      phaseId,
    })
    return NextResponse.json({ warnings })
  } catch (err) {
    return apiError(
      "list_failed",
      err instanceof Error ? err.message : "Resolve failed",
      500
    )
  }
}
