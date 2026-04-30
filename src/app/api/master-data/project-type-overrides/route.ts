import { NextResponse } from "next/server"

import { apiError } from "@/app/api/_lib/route-helpers"

import { memberTenantContext } from "../_lib/admin-tenant"

// PROJ-16 — list all project-type overrides for the caller's tenant.
// GET /api/master-data/project-type-overrides
//
// Read opened to tenant_member (PROJ-5 wizard reads this). Writes
// (PUT / DELETE) stay admin-only via adminTenantContext in [key]/route.ts.

const SELECT_COLUMNS =
  "id, tenant_id, type_key, overrides, updated_by, created_at, updated_at"

export async function GET() {
  const ctx = await memberTenantContext()
  if ("error" in ctx) return ctx.error

  const { data, error } = await ctx.supabase
    .from("tenant_project_type_overrides")
    .select(SELECT_COLUMNS)
    .eq("tenant_id", ctx.tenantId)
    .order("type_key", { ascending: true })

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ overrides: data ?? [] })
}
