import { NextResponse } from "next/server"

import {
  IMPORT_SELECT_COLUMNS,
  normalizeImport,
  requireOrganizationImportAdmin,
} from "./_helpers"
import { apiError } from "../_lib/route-helpers"

export async function GET() {
  const ctx = await requireOrganizationImportAdmin("read")
  if ("error" in ctx) return ctx.error

  const { data, error } = await ctx.supabase
    .from("organization_imports")
    .select(IMPORT_SELECT_COLUMNS)
    .eq("tenant_id", ctx.tenantId)
    .order("uploaded_at", { ascending: false })
    .limit(50)

  if (error) return apiError("list_failed", error.message, 500)

  return NextResponse.json({
    imports: (data ?? []).map(normalizeImport),
  })
}
