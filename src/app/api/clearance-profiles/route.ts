import { NextResponse } from "next/server"

import { resolveActiveTenantId } from "../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../_lib/route-helpers"

import { createProfileSchema } from "./_schema"

// PROJ-100b — clearance-profile catalog (tenant-scoped).
//
// GET  /api/clearance-profiles  — list the tenant's profiles (any member; RLS
//      restricts rows to the caller's tenant).
// POST /api/clearance-profiles  — create a profile (tenant-admin only).

const SELECT_COLUMNS =
  "id, tenant_id, name, description, granted_level, is_active, created_by, created_at, updated_at"

export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // RLS scopes rows to the caller's tenant (is_tenant_member).
  const { data, error } = await supabase
    .from("ma_clearance_profiles")
    .select(SELECT_COLUMNS)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true })
    .limit(500)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ profiles: data ?? [] })
}

export async function POST(request: Request) {
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
  const parsed = createProfileSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { data, error } = await supabase
    .from("ma_clearance_profiles")
    .insert({
      tenant_id: tenantId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      granted_level: parsed.data.granted_level,
      is_active: parsed.data.is_active ?? true,
      created_by: userId,
    })
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "23505") {
      return apiError(
        "conflict",
        "A profile with this name already exists for your tenant.",
        409,
        "name"
      )
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ profile: data }, { status: 201 })
}
