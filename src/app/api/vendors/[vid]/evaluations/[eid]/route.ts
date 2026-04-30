import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import { apiError } from "../../../../_lib/route-helpers"
import { vendorTenantContext } from "../../../_lib/tenant"

// PROJ-15 — single evaluation: DELETE only (no PATCH in MVP).

interface Ctx {
  params: Promise<{ vid: string; eid: string }>
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { vid, eid } = await ctx.params
  if (
    !z.string().uuid().safeParse(vid).success ||
    !z.string().uuid().safeParse(eid).success
  ) {
    return apiError("validation_error", "Invalid id.", 400)
  }

  const auth = await vendorTenantContext()
  if ("error" in auth) return auth.error

  const moduleDenial = await requireModuleActive(
    auth.supabase,
    auth.tenantId,
    "vendor",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  const { error } = await auth.supabase
    .from("vendor_evaluations")
    .delete()
    .eq("id", eid)
    .eq("vendor_id", vid)

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Tenant admin or editor role required.", 403)
    }
    return apiError("delete_failed", error.message, 500)
  }
  return new NextResponse(null, { status: 204 })
}
