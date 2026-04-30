import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import { requireModuleActive } from "@/lib/tenant-settings/server"

// DELETE /api/tenants/[id]/fx-rates/[rid]
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

  const moduleDenial = await requireModuleActive(supabase, tenantId, "budget", {
    intent: "write",
  })
  if (moduleDenial) return moduleDenial

  const { data, error } = await supabase
    .from("fx_rates")
    .delete()
    .eq("id", rateId)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle()

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Tenant admin required.", 403)
    return apiError("delete_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Rate not found.", 404)
  return new NextResponse(null, { status: 204 })
}
