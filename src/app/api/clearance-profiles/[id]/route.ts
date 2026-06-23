import { NextResponse } from "next/server"
import { z } from "zod"

import { resolveActiveTenantId } from "../../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../_lib/route-helpers"

import { updateProfileSchema } from "../_schema"

// PROJ-100b — single clearance-profile management (tenant-admin only).
//
// PATCH  /api/clearance-profiles/[id]  — edit name/description/level, or
//        deactivate (is_active=false). Deactivating leaves existing clearances
//        granted via this profile untouched.
// DELETE /api/clearance-profiles/[id]  — hard delete (rare; the UI deactivates).

const SELECT_COLUMNS =
  "id, tenant_id, name, description, granted_level, is_active, created_by, created_at, updated_at"

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid profile id.", 400, "id")
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
  const parsed = updateProfileSchema.safeParse(body)
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
  if (parsed.data.name !== undefined) patch.name = parsed.data.name
  if (parsed.data.description !== undefined)
    patch.description = parsed.data.description ?? null
  if (parsed.data.granted_level !== undefined)
    patch.granted_level = parsed.data.granted_level
  if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active

  const { data, error } = await supabase
    .from("ma_clearance_profiles")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select(SELECT_COLUMNS)
    .maybeSingle()

  if (error) {
    if (error.code === "23505") {
      return apiError(
        "conflict",
        "A profile with this name already exists for your tenant.",
        409,
        "name"
      )
    }
    return apiError("update_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Profile not found.", 404)

  return NextResponse.json({ profile: data })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid profile id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const adminDenial = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminDenial) return adminDenial

  const { error } = await supabase
    .from("ma_clearance_profiles")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId)

  if (error) return apiError("delete_failed", error.message, 500)
  return NextResponse.json({ ok: true })
}
