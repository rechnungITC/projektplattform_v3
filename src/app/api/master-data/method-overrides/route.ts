import { NextResponse } from "next/server"

import { apiError } from "@/app/api/_lib/route-helpers"

import { adminTenantContext } from "../_lib/admin-tenant"

// PROJ-16 — list all method overrides for the caller's tenant.
// GET /api/master-data/method-overrides

const SELECT_COLUMNS =
  "id, tenant_id, method_key, enabled, updated_by, created_at, updated_at"

export async function GET() {
  const ctx = await adminTenantContext()
  if ("error" in ctx) return ctx.error

  const { data, error } = await ctx.supabase
    .from("tenant_method_overrides")
    .select(SELECT_COLUMNS)
    .eq("tenant_id", ctx.tenantId)
    .order("method_key", { ascending: true })

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ overrides: data ?? [] })
}
