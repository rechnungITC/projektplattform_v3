import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../_lib/route-helpers"

import {
  normalizeTenantSettingsPayload,
  tenantSettingsPatchSchema as settingsPatchSchema,
} from "./_schema"

// PROJ-17 — GET/PATCH /api/tenants/[id]/settings
//
// Admin-only configuration surface for module gating, privacy defaults,
// AI-provider selection, retention overrides, and (PROJ-24 ST-02) cost-stack
// defaults. RLS additionally enforces tenant_admin (with the same predicate
// as `requireTenantAdmin`) — this route fails fast with a friendly 403
// instead of leaking RLS-shape errors.

const SELECT_COLUMNS =
  "tenant_id, active_modules, privacy_defaults, ai_provider_config, retention_overrides, cost_settings, created_at, updated_at"

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id: tenantId } = await ctx.params

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const denied = await requireTenantAdmin(supabase, tenantId, userId)
  if (denied) return denied

  const { data, error } = await supabase
    .from("tenant_settings")
    .select(SELECT_COLUMNS)
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (error) {
    return apiError("read_failed", error.message, 500)
  }
  if (!data) {
    return apiError("not_found", "Tenant settings not found.", 404)
  }
  return NextResponse.json({ settings: data })
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id: tenantId } = await ctx.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = settingsPatchSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const denied = await requireTenantAdmin(supabase, tenantId, userId)
  if (denied) return denied

  // Spread-Pattern: schema is the single source of truth. Optional fields
  // that weren't provided are absent from parsed.data, so the spread leaves
  // them untouched on the row.
  const updates = normalizeTenantSettingsPayload(parsed.data)

  const { data, error } = await supabase
    .from("tenant_settings")
    .update(updates)
    .eq("tenant_id", tenantId)
    .select(SELECT_COLUMNS)
    .maybeSingle()

  if (error) {
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("update_failed", error.message, 500)
  }
  if (!data) {
    return apiError("not_found", "Tenant settings not found.", 404)
  }

  return NextResponse.json({ settings: data })
}
