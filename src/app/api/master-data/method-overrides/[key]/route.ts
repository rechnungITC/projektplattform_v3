import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError } from "@/app/api/_lib/route-helpers"
import { isValidMethodKey } from "@/lib/method-templates/overrides"

import { adminTenantContext } from "../../_lib/admin-tenant"

// PROJ-16 — set a method's enabled state for the caller's tenant.
// PUT /api/master-data/method-overrides/[key]    body: { enabled: boolean }
//
// The DB trigger enforces "at least one method must remain enabled" —
// the API route catches the SQLSTATE P0001 from `enforce_min_one_method_enabled`
// and maps it to 422.

const SELECT_COLUMNS =
  "id, tenant_id, method_key, enabled, updated_by, created_at, updated_at"

const PutSchema = z.object({ enabled: z.boolean() })

interface Ctx {
  params: Promise<{ key: string }>
}

export async function PUT(request: Request, ctx: Ctx) {
  const { key } = await ctx.params
  if (!isValidMethodKey(key)) {
    return apiError("not_found", "Unknown method key.", 404)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = PutSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const auth = await adminTenantContext()
  if ("error" in auth) return auth.error

  const { data: row, error } = await auth.supabase
    .from("tenant_method_overrides")
    .upsert(
      {
        tenant_id: auth.tenantId,
        method_key: key,
        enabled: parsed.data.enabled,
        updated_by: auth.userId,
      },
      { onConflict: "tenant_id,method_key" }
    )
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    // DB trigger raises P0001 when the operation would leave 0 methods enabled.
    if (
      error.code === "P0001" ||
      error.message.includes("min_one_method_enabled")
    ) {
      return apiError(
        "min_one_method_enabled",
        "Mindestens eine Methode muss aktiviert bleiben.",
        422
      )
    }
    if (error.code === "42501") {
      return apiError("forbidden", "Tenant admin role required.", 403)
    }
    return apiError("save_failed", error.message, 500)
  }
  return NextResponse.json({ override: row })
}
