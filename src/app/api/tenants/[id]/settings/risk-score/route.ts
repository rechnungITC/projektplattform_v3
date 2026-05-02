/**
 * PROJ-35 Phase 35-α — Tenant-level Risk-Score-Configuration.
 *
 * GET    /api/tenants/[id]/settings/risk-score
 *        Returns { defaults, overrides, effective } so the UI can render
 *        the form (overrides) plus a live preview (effective) without
 *        round-tripping the merge logic.
 *
 * PUT    /api/tenants/[id]/settings/risk-score
 *        Body: full or partial overrides object (Zod-validated). Persists
 *        via UPDATE on tenant_settings.risk_score_overrides. Tenant-Admin
 *        only (RBAC + RLS defense-in-depth).
 *
 * DELETE /api/tenants/[id]/settings/risk-score
 *        Resets overrides to {} (effective → pure defaults).
 */

import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
  requireTenantMember,
} from "@/app/api/_lib/route-helpers"
import {
  RISK_SCORE_DEFAULTS,
  type RiskScoreConfig,
} from "@/lib/risk-score/defaults"
import {
  mergeRiskScoreConfig,
  riskScoreOverridesSchema,
} from "@/lib/risk-score/merge-overrides"

interface Ctx {
  params: Promise<{ id: string }>
}

interface RiskScoreSettingsResponse {
  defaults: RiskScoreConfig
  overrides: unknown
  effective: RiskScoreConfig
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id: tenantId } = await ctx.params

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // GET allows any tenant member — needed for the "Why this score?" tooltip
  // in the Stakeholder-Detail-Banner (PROJ-35-β UI). PUT/DELETE remain
  // tenant_admin-gated below. RLS on tenant_settings agrees: SELECT for
  // members, UPDATE for admins.
  const denied = await requireTenantMember(supabase, tenantId, userId)
  if (denied) return denied

  const { data, error } = await supabase
    .from("tenant_settings")
    .select("tenant_id, risk_score_overrides")
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (error) return apiError("read_failed", error.message, 500)
  if (!data) return apiError("not_found", "Tenant settings not found.", 404)

  const row = data as { tenant_id: string; risk_score_overrides: unknown }
  const overrides = row.risk_score_overrides ?? {}
  const body: RiskScoreSettingsResponse = {
    defaults: { ...RISK_SCORE_DEFAULTS },
    overrides,
    effective: mergeRiskScoreConfig(overrides),
  }
  return NextResponse.json(body)
}

export async function PUT(request: Request, ctx: Ctx) {
  const { id: tenantId } = await ctx.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = riskScoreOverridesSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid overrides object.",
      400,
      first?.path?.[0]?.toString(),
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const denied = await requireTenantAdmin(supabase, tenantId, userId)
  if (denied) return denied

  const { data, error } = await supabase
    .from("tenant_settings")
    .update({ risk_score_overrides: parsed.data })
    .eq("tenant_id", tenantId)
    .select("tenant_id, risk_score_overrides")
    .maybeSingle()

  if (error) {
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("update_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Tenant settings not found.", 404)

  const row = data as { tenant_id: string; risk_score_overrides: unknown }
  const body2: RiskScoreSettingsResponse = {
    defaults: { ...RISK_SCORE_DEFAULTS },
    overrides: row.risk_score_overrides ?? {},
    effective: mergeRiskScoreConfig(row.risk_score_overrides),
  }
  return NextResponse.json(body2)
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id: tenantId } = await ctx.params

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const denied = await requireTenantAdmin(supabase, tenantId, userId)
  if (denied) return denied

  const { data, error } = await supabase
    .from("tenant_settings")
    .update({ risk_score_overrides: {} })
    .eq("tenant_id", tenantId)
    .select("tenant_id, risk_score_overrides")
    .maybeSingle()

  if (error) return apiError("update_failed", error.message, 500)
  if (!data) return apiError("not_found", "Tenant settings not found.", 404)

  const body: RiskScoreSettingsResponse = {
    defaults: { ...RISK_SCORE_DEFAULTS },
    overrides: {},
    effective: { ...RISK_SCORE_DEFAULTS },
  }
  return NextResponse.json(body)
}
