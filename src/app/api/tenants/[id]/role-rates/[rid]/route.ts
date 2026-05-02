import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "@/app/api/_lib/route-helpers"
import { writeCostAuditEntry } from "@/app/api/_lib/cost-audit"

// PROJ-24 ST-07 — DELETE /api/tenants/[id]/role-rates/[rid]
// Used for typo-correction of a freshly-created rate. Existing cost-lines
// were captured with their rate-snapshot at creation time and are NOT
// affected by deleting the role_rates row.
//
// Auth: tenant-admin via RLS + explicit `requireTenantAdmin` for clean 403.
// Synthetic DELETE-audit captures the deleted snapshot in `old_value`.
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; rid: string }> }
) {
  const { id: tenantId, rid: rateId } = await context.params
  if (!z.string().uuid().safeParse(tenantId).success) {
    return apiError("validation_error", "Invalid tenant id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(rateId).success) {
    return apiError("validation_error", "Invalid rate id.", 400, "rid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const adminError = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminError) return adminError

  // Read first so we can capture the snapshot for the synthetic DELETE audit
  // entry. RLS (select_tenant_member) lets the admin see it; if it's missing,
  // RLS returns null which we surface as 404.
  const { data: existing, error: readErr } = await supabase
    .from("role_rates")
    .select("id, role_key, daily_rate, currency, valid_from")
    .eq("id", rateId)
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (readErr) return apiError("internal_error", readErr.message, 500)
  if (!existing) return apiError("not_found", "Rate not found.", 404)

  const { data: deleted, error: deleteErr } = await supabase
    .from("role_rates")
    .delete()
    .eq("id", rateId)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle()

  if (deleteErr) {
    if (deleteErr.code === "42501") return apiError("forbidden", "Tenant admin required.", 403)
    return apiError("delete_failed", deleteErr.message, 500)
  }
  // Race condition: row was already deleted between read and delete. Treat as 404.
  if (!deleted) return apiError("not_found", "Rate not found.", 404)

  await writeCostAuditEntry({
    tenantId,
    entity: "role_rates",
    entityId: rateId,
    action: "delete",
    oldValue: {
      role_key: existing.role_key,
      daily_rate: existing.daily_rate,
      currency: existing.currency,
      valid_from: existing.valid_from,
    },
    newValue: null,
    actorUserId: userId,
    reason: "Tagessatz gelöscht",
  })

  return new NextResponse(null, { status: 204 })
}
