/**
 * PROJ-32-d — Tenant AI Cost-Cap Configuration
 *
 *   GET /api/tenants/[id]/ai-cost-cap
 *   PUT /api/tenants/[id]/ai-cost-cap
 *
 * Admin-only. Stores per-tenant monthly token caps. NULL = unlimited.
 * Used by the AI router for the pre-call gate (see lib/ai/cost-cap.ts).
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../_lib/route-helpers"

interface Ctx {
  params: Promise<{ id: string }>
}

const putBodySchema = z.object({
  monthly_input_token_cap: z
    .number()
    .int()
    .min(0, "monthly_input_token_cap must be non-negative.")
    .nullable(),
  monthly_output_token_cap: z
    .number()
    .int()
    .min(0, "monthly_output_token_cap must be non-negative.")
    .nullable(),
  cap_action: z.enum(["block", "warn_only"]),
})

interface CostCapRow {
  monthly_input_token_cap: number | null
  monthly_output_token_cap: number | null
  cap_action: "block" | "warn_only"
  updated_at: string
  updated_by: string | null
}

// ---------------------------------------------------------------------------
// GET — return the current cap config (or empty defaults if no row).
// ---------------------------------------------------------------------------

export async function GET(_request: Request, ctx: Ctx) {
  const { id: tenantId } = await ctx.params

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const denied = await requireTenantAdmin(supabase, tenantId, userId)
  if (denied) return denied

  const { data, error } = await supabase
    .from("tenant_ai_cost_caps")
    .select(
      "monthly_input_token_cap, monthly_output_token_cap, cap_action, updated_at, updated_by",
    )
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (error) return apiError("read_failed", error.message, 500)

  if (!data) {
    return NextResponse.json({
      monthly_input_token_cap: null,
      monthly_output_token_cap: null,
      cap_action: "block",
      configured: false,
    })
  }
  const row = data as CostCapRow
  return NextResponse.json({
    monthly_input_token_cap: row.monthly_input_token_cap,
    monthly_output_token_cap: row.monthly_output_token_cap,
    cap_action: row.cap_action,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
    configured: true,
  })
}

// ---------------------------------------------------------------------------
// PUT — upsert the cap config. Audit each changed field.
// ---------------------------------------------------------------------------

export async function PUT(request: Request, ctx: Ctx) {
  const { id: tenantId } = await ctx.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = putBodySchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.join(".") ?? undefined,
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const denied = await requireTenantAdmin(supabase, tenantId, userId)
  if (denied) return denied

  // Read previous values for audit diff.
  const { data: prev } = await supabase
    .from("tenant_ai_cost_caps")
    .select("monthly_input_token_cap, monthly_output_token_cap, cap_action")
    .eq("tenant_id", tenantId)
    .maybeSingle()

  const { error: upErr } = await supabase
    .from("tenant_ai_cost_caps")
    .upsert(
      {
        tenant_id: tenantId,
        monthly_input_token_cap: parsed.data.monthly_input_token_cap,
        monthly_output_token_cap: parsed.data.monthly_output_token_cap,
        cap_action: parsed.data.cap_action,
        updated_by: userId,
      },
      { onConflict: "tenant_id" },
    )
  if (upErr) {
    if (upErr.code === "42501") {
      return apiError(
        "forbidden",
        "Tenant admin role required to update cost caps.",
        403,
      )
    }
    return apiError("upsert_failed", upErr.message, 500)
  }

  // Audit each changed field separately so the audit-trail diff stays
  // field-level (matches PROJ-10 convention).
  const prevRow = (prev ?? null) as CostCapRow | null
  const audits: Array<{
    field: string
    oldVal: unknown
    newVal: unknown
  }> = []
  if (
    (prevRow?.monthly_input_token_cap ?? null) !==
    parsed.data.monthly_input_token_cap
  ) {
    audits.push({
      field: "monthly_input_token_cap",
      oldVal: prevRow?.monthly_input_token_cap ?? null,
      newVal: parsed.data.monthly_input_token_cap,
    })
  }
  if (
    (prevRow?.monthly_output_token_cap ?? null) !==
    parsed.data.monthly_output_token_cap
  ) {
    audits.push({
      field: "monthly_output_token_cap",
      oldVal: prevRow?.monthly_output_token_cap ?? null,
      newVal: parsed.data.monthly_output_token_cap,
    })
  }
  if ((prevRow?.cap_action ?? "block") !== parsed.data.cap_action) {
    audits.push({
      field: "cap_action",
      oldVal: prevRow?.cap_action ?? null,
      newVal: parsed.data.cap_action,
    })
  }

  for (const a of audits) {
    const { error: auditErr } = await supabase.rpc(
      "record_tenant_ai_cost_cap_audit",
      {
        p_tenant_id: tenantId,
        p_field_name: a.field,
        p_old_value: a.oldVal === null ? null : { value: a.oldVal },
        p_new_value: a.newVal === null ? null : { value: a.newVal },
      },
    )
    if (auditErr) {
      console.error(
        `[PROJ-32-d] record_tenant_ai_cost_cap_audit failed for ${tenantId}/${a.field}: ${auditErr.message}`,
      )
    }
  }

  return NextResponse.json({
    monthly_input_token_cap: parsed.data.monthly_input_token_cap,
    monthly_output_token_cap: parsed.data.monthly_output_token_cap,
    cap_action: parsed.data.cap_action,
    configured: true,
  })
}
