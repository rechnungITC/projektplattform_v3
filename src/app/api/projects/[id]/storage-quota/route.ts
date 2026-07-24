/**
 * PROJ-79-α — GET /api/projects/[id]/storage-quota
 *
 * Return the tenant storage-quota status for a project (feeds the UI quota
 * bar + upload pre-flight). Backed by the `dms_quota_status` SECURITY
 * DEFINER RPC, which is itself gated on project membership — so "view"
 * access is sufficient and non-admins can read it without widening the
 * tenant-admin-only base-table SELECT policy.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import type { QuotaStatus, QuotaStatusRow } from "@/types/dms"

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

  const { data, error } = await supabase.rpc("dms_quota_status", {
    p_project_id: projectId,
  })
  if (error) {
    if (error.code === "42501")
      return apiError("forbidden", error.message ?? "Not allowed.", 403)
    if (error.code === "P0002")
      return apiError("not_found", "Project not found.", 404)
    return apiError("internal_error", error.message ?? "Quota check failed.", 500)
  }

  const row = (Array.isArray(data) ? data[0] : data) as QuotaStatusRow | undefined
  const max_bytes = row?.max_bytes ?? 5_368_709_120
  const current_usage_bytes = row?.current_usage_bytes ?? 0
  const soft_warning_pct = row?.soft_warning_pct ?? 80

  const pct_used =
    max_bytes > 0 ? Math.round((current_usage_bytes / max_bytes) * 100) : 0
  const status: QuotaStatus = {
    max_bytes,
    current_usage_bytes,
    soft_warning_pct,
    pct_used,
    over_soft_warning: pct_used >= soft_warning_pct,
  }
  return NextResponse.json(status)
}
