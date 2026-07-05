import { NextResponse } from "next/server"

import { resolveActiveTenantId } from "../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../_lib/route-helpers"

import { createRiskCategorySchema, RISK_CATEGORY_SELECT } from "./_schema"

// PROJ-107 — tenant-scoped risk category catalog.
//
// GET  /api/risk-categories  — list the tenant's categories (any member; RLS
//      restricts rows to the caller's tenant). Includes inactive for admin UI.
// POST /api/risk-categories  — create a category (tenant-admin only).

export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // RLS scopes rows to the caller's tenant (is_tenant_member).
  const { data, error } = await supabase
    .from("risk_categories")
    .select(RISK_CATEGORY_SELECT)
    .order("is_active", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true })
    .limit(500)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ categories: data ?? [] })
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
  const parsed = createRiskCategorySchema.safeParse(body)
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
    .from("risk_categories")
    .insert({
      tenant_id: tenantId,
      key: parsed.data.key,
      label: parsed.data.label,
      applies_to_project_type: parsed.data.applies_to_project_type ?? null,
      sort_order: parsed.data.sort_order ?? 0,
      is_active: parsed.data.is_active ?? true,
      created_by: userId,
    })
    .select(RISK_CATEGORY_SELECT)
    .single()

  if (error) {
    if (error.code === "23505") {
      return apiError(
        "conflict",
        "A category with this key already exists for your tenant.",
        409,
        "key"
      )
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ category: data }, { status: 201 })
}
