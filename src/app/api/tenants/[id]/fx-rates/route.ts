import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  fxRateCreateSchema as createSchema,
  normalizeFxRatePayload,
} from "./_schema"

// GET /api/tenants/[id]/fx-rates
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: tenantId } = await context.params
  if (!z.string().uuid().safeParse(tenantId).success) {
    return apiError("validation_error", "Invalid tenant id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const moduleDenial = await requireModuleActive(supabase, tenantId, "budget", {
    intent: "read",
  })
  if (moduleDenial) return moduleDenial

  const { data, error } = await supabase
    .from("fx_rates")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("valid_on", { ascending: false })
    .limit(500)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ rates: data ?? [] })
}

// POST /api/tenants/[id]/fx-rates
//   Admin-only via RLS (fx_rates_insert_admin policy).
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: tenantId } = await context.params
  if (!z.string().uuid().safeParse(tenantId).success) {
    return apiError("validation_error", "Invalid tenant id.", 400, "id")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be JSON.", 400)
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    const f = parsed.error.issues[0]
    return apiError(
      "validation_error",
      f?.message ?? "Invalid body.",
      400,
      f?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const moduleDenial = await requireModuleActive(supabase, tenantId, "budget", {
    intent: "write",
  })
  if (moduleDenial) return moduleDenial

  const { data, error } = await supabase
    .from("fx_rates")
    .insert({
      ...normalizeFxRatePayload(parsed.data),
      source: parsed.data.source ?? "manual",
      tenant_id: tenantId,
      created_by: userId,
    })
    .select()
    .single()

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Tenant admin required.", 403)
    if (error.code === "23505") {
      return apiError(
        "rate_exists",
        "Eine Rate für dieses Pair + Datum + Quelle existiert bereits.",
        409
      )
    }
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ rate: data }, { status: 201 })
}
