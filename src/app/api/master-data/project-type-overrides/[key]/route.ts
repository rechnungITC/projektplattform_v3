import { NextResponse } from "next/server"

import { apiError } from "@/app/api/_lib/route-helpers"
import {
  isValidProjectTypeKey,
  ProjectTypeOverrideSchema,
} from "@/lib/project-types/overrides"

import { adminTenantContext } from "../../_lib/admin-tenant"

// PROJ-16 — single project-type override.
// PUT    /api/master-data/project-type-overrides/[key]   → upsert
// DELETE /api/master-data/project-type-overrides/[key]   → reset to default

const SELECT_COLUMNS =
  "id, tenant_id, type_key, overrides, updated_by, created_at, updated_at"

interface Ctx {
  params: Promise<{ key: string }>
}

export async function PUT(request: Request, ctx: Ctx) {
  const { key } = await ctx.params
  if (!isValidProjectTypeKey(key)) {
    return apiError("not_found", "Unknown project-type key.", 404)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = ProjectTypeOverrideSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid override payload.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const auth = await adminTenantContext()
  if ("error" in auth) return auth.error

  const { data: row, error } = await auth.supabase
    .from("tenant_project_type_overrides")
    .upsert(
      {
        tenant_id: auth.tenantId,
        type_key: key,
        overrides: parsed.data,
        updated_by: auth.userId,
      },
      { onConflict: "tenant_id,type_key" }
    )
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Tenant admin role required.", 403)
    }
    return apiError("save_failed", error.message, 500)
  }
  return NextResponse.json({ override: row })
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { key } = await ctx.params
  if (!isValidProjectTypeKey(key)) {
    return apiError("not_found", "Unknown project-type key.", 404)
  }

  const auth = await adminTenantContext()
  if ("error" in auth) return auth.error

  const { error } = await auth.supabase
    .from("tenant_project_type_overrides")
    .delete()
    .eq("tenant_id", auth.tenantId)
    .eq("type_key", key)

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Tenant admin role required.", 403)
    }
    return apiError("delete_failed", error.message, 500)
  }
  return new NextResponse(null, { status: 204 })
}
