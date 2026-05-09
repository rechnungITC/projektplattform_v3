import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { resolveProjectHealthSummary } from "@/lib/project-health/summary"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  try {
    const summary = await resolveProjectHealthSummary({
      supabase,
      projectId,
      tenantId: access.project.tenant_id,
    })
    return NextResponse.json({ summary })
  } catch (err) {
    return apiError(
      "health_summary_failed",
      err instanceof Error ? err.message : "Health summary failed.",
      500,
    )
  }
}
