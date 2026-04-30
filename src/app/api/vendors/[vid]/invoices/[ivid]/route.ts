import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import { requireModuleActive } from "@/lib/tenant-settings/server"

// DELETE /api/vendors/[vid]/invoices/[ivid]
//   Löschen einer Vendor-Rechnung. Eventuelle abgeleitete Buchungen
//   bleiben unverändert (source_ref_id zeigt dann auf gelöschte Rechnung).
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ vid: string; ivid: string }> }
) {
  const { vid: vendorId, ivid: invoiceId } = await context.params
  if (!z.string().uuid().safeParse(vendorId).success) {
    return apiError("validation_error", "Invalid vendor id.", 400, "vid")
  }
  if (!z.string().uuid().safeParse(invoiceId).success) {
    return apiError("validation_error", "Invalid invoice id.", 400, "ivid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: vendor } = await supabase
    .from("vendors")
    .select("tenant_id")
    .eq("id", vendorId)
    .maybeSingle()
  if (!vendor) return apiError("not_found", "Vendor not found.", 404)
  const moduleDenial = await requireModuleActive(
    supabase,
    vendor.tenant_id,
    "budget",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  const { data, error } = await supabase
    .from("vendor_invoices")
    .delete()
    .eq("id", invoiceId)
    .eq("vendor_id", vendorId)
    .select("id")
    .maybeSingle()

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Lead or admin role required.", 403)
    return apiError("delete_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Invoice not found.", 404)
  return new NextResponse(null, { status: 204 })
}
