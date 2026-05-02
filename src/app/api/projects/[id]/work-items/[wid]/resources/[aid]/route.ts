import { NextResponse } from "next/server"
import { z } from "zod"

import { synthesizeResourceAllocationCostLines } from "@/lib/cost"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../../_lib/route-helpers"

/**
 * PROJ-24 Phase δ — best-effort cost-line synthesis hook.
 *
 * Wraps `synthesizeResourceAllocationCostLines` with an admin-client init
 * fallback. NEVER throws. Caller's primary mutation (allocation update or
 * delete) has already succeeded — a cost-calc failure must not surface as
 * a 5xx (Tech Design §12 fail-open contract).
 */
async function safeSynthesizeCostLines(
  tenantId: string,
  projectId: string,
  workItemId: string,
  userId: string
): Promise<void> {
  try {
    const adminClient = createAdminClient()
    await synthesizeResourceAllocationCostLines({
      adminClient,
      tenantId,
      projectId,
      workItemId,
      actorUserId: userId,
    })
  } catch (err) {
    console.error(
      `[PROJ-24] cost-line synthesis skipped for work_item=${workItemId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}

// PROJ-11 — single allocation endpoints.
// PATCH  /api/projects/[id]/work-items/[wid]/resources/[aid]
// DELETE /api/projects/[id]/work-items/[wid]/resources/[aid]

const SELECT_COLUMNS =
  "id, tenant_id, project_id, work_item_id, resource_id, allocation_pct, created_by, created_at, updated_at"

const patchSchema = z
  .object({
    allocation_pct: z.number().min(0).max(200).optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "At least one field must be provided.",
  })

interface Ctx {
  params: Promise<{ id: string; wid: string; aid: string }>
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id: projectId, wid, aid } = await ctx.params
  if (
    !z.string().uuid().safeParse(wid).success ||
    !z.string().uuid().safeParse(aid).success
  ) {
    return apiError("validation_error", "Invalid id.", 400)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "resources",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  const { data: row, error } = await supabase
    .from("work_item_resources")
    .update({ allocation_pct: parsed.data.allocation_pct })
    .eq("id", aid)
    .eq("project_id", projectId)
    .eq("work_item_id", wid)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") {
      return apiError("not_found", "Allocation not found.", 404)
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("update_failed", error.message, 500)
  }

  // PROJ-24 Phase δ — Replace-on-Update cost-lines.
  await safeSynthesizeCostLines(access.project.tenant_id, projectId, wid, userId)

  return NextResponse.json({ allocation: row })
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id: projectId, wid, aid } = await ctx.params
  if (
    !z.string().uuid().safeParse(wid).success ||
    !z.string().uuid().safeParse(aid).success
  ) {
    return apiError("validation_error", "Invalid id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "resources",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  const { error } = await supabase
    .from("work_item_resources")
    .delete()
    .eq("id", aid)
    .eq("project_id", projectId)
    .eq("work_item_id", wid)

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Editor or lead role required.", 403)
    }
    return apiError("delete_failed", error.message, 500)
  }

  // PROJ-24 Phase δ — Replace-on-Update cost-lines (engine sees the
  // reduced allocation set; if this was the last allocation, all
  // resource_allocation cost-lines for the work-item end up cleared).
  await safeSynthesizeCostLines(access.project.tenant_id, projectId, wid, userId)

  return new NextResponse(null, { status: 204 })
}
