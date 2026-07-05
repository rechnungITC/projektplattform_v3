import { NextResponse } from "next/server"
import { z } from "zod"

import { resolveActiveTenantId } from "../../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../_lib/route-helpers"

import { RISK_CATEGORY_SELECT, updateRiskCategorySchema } from "../_schema"

// PROJ-107 — single risk-category management (tenant-admin only).
//
// PATCH  /api/risk-categories/[id]  — edit label/key/type/sort, or deactivate
//        (is_active=false). Deactivating leaves existing risk.category_id refs
//        intact (the FK stays valid); the picker just hides inactive entries.
// DELETE /api/risk-categories/[id]  — hard delete (rare). risks.category_id is
//        ON DELETE SET NULL, so referencing risks are un-categorised, not lost.

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid category id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const adminDenial = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminDenial) return adminDenial

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = updateRiskCategorySchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.key !== undefined) patch.key = parsed.data.key
  if (parsed.data.label !== undefined) patch.label = parsed.data.label
  if (parsed.data.applies_to_project_type !== undefined)
    patch.applies_to_project_type = parsed.data.applies_to_project_type ?? null
  if (parsed.data.sort_order !== undefined)
    patch.sort_order = parsed.data.sort_order
  if (parsed.data.is_active !== undefined)
    patch.is_active = parsed.data.is_active

  const { data, error } = await supabase
    .from("risk_categories")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select(RISK_CATEGORY_SELECT)
    .maybeSingle()

  if (error) {
    if (error.code === "23505") {
      return apiError(
        "conflict",
        "A category with this key already exists for your tenant.",
        409,
        "key"
      )
    }
    return apiError("update_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Category not found.", 404)

  return NextResponse.json({ category: data })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid category id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const adminDenial = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminDenial) return adminDenial

  const { error } = await supabase
    .from("risk_categories")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)

  if (error) return apiError("delete_failed", error.message, 500)
  return NextResponse.json({ ok: true })
}
