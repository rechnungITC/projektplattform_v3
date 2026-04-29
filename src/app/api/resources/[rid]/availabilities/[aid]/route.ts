import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
} from "../../../../_lib/route-helpers"

// PROJ-11 — delete a single availability segment.
// DELETE /api/resources/[rid]/availabilities/[aid]

interface Ctx {
  params: Promise<{ rid: string; aid: string }>
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { rid, aid } = await ctx.params
  if (
    !z.string().uuid().safeParse(rid).success ||
    !z.string().uuid().safeParse(aid).success
  ) {
    return apiError("validation_error", "Invalid id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: resource, error: rErr } = await supabase
    .from("resources")
    .select("id, tenant_id")
    .eq("id", rid)
    .maybeSingle()
  if (rErr) return apiError("read_failed", rErr.message, 500)
  if (!resource) return apiError("not_found", "Resource not found.", 404)

  const moduleDenial = await requireModuleActive(
    supabase,
    resource.tenant_id as string,
    "resources",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  const { error } = await supabase
    .from("resource_availabilities")
    .delete()
    .eq("id", aid)
    .eq("resource_id", rid)

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Editor or admin role required.", 403)
    }
    return apiError("delete_failed", error.message, 500)
  }
  return new NextResponse(null, { status: 204 })
}
