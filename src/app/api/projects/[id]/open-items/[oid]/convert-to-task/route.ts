import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"

// PROJ-20 — POST /api/projects/[id]/open-items/[oid]/convert-to-task
// Atomic conversion: creates a work_item with kind=task and flips the open
// item's status to 'converted'. Implementation lives in the SECURITY DEFINER
// RPC `convert_open_item_to_task`.

interface Ctx {
  params: Promise<{ id: string; oid: string }>
}

export async function POST(_request: Request, ctx: Ctx) {
  const { id: projectId, oid } = await ctx.params
  if (!z.string().uuid().safeParse(oid).success) {
    return apiError("validation_error", "Invalid open item id.", 400, "oid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "decisions",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  const { data: result, error: rpcErr } = await supabase
    .rpc("convert_open_item_to_task", { p_open_item_id: oid })
    .single<{ success: boolean; message: string; work_item_id: string | null }>()

  if (rpcErr) {
    return apiError("convert_failed", rpcErr.message, 500)
  }
  if (!result?.success) {
    if (result?.message === "open_item_not_found") {
      return apiError("not_found", "Open item not found.", 404)
    }
    if (result?.message === "already_converted") {
      return apiError("conflict", "Open item already converted.", 409)
    }
    if (result?.message === "forbidden") {
      return apiError(
        "forbidden",
        "Editor or lead role required to convert.",
        403
      )
    }
    return apiError("convert_failed", result?.message ?? "unknown", 422)
  }

  return NextResponse.json({
    ok: true,
    work_item_id: result.work_item_id,
  })
}
