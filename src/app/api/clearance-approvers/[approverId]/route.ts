import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../_lib/route-helpers"
import { resolveActiveTenantId } from "../../_lib/active-tenant"

// PROJ-100c — remove an approver from the tenant pool (tenant-admin).
// DELETE /api/clearance-approvers/[approverId]

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ approverId: string }> }
) {
  const { approverId } = await context.params
  if (!z.string().uuid().safeParse(approverId).success) {
    return apiError("validation_error", "Invalid approver id.", 400, "approverId")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const adminDenial = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminDenial) return adminDenial

  const { error } = await supabase
    .from("ma_clearance_approvers")
    .delete()
    .eq("id", approverId)
    .eq("tenant_id", tenantId)

  if (error) return apiError("delete_failed", error.message, 500)
  return NextResponse.json({ ok: true })
}
