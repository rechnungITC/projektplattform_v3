import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "@/app/api/_lib/route-helpers"
import { writeCostAuditEntry } from "@/app/api/_lib/cost-audit"

import {
  normalizeRoleRatePayload,
  roleRateCreateSchema as createSchema,
} from "./_schema"

// PROJ-24 ST-07 — role_rates list/create.
// GET  /api/tenants/[id]/role-rates  — full versioned list (RLS filters per tenant)
// POST /api/tenants/[id]/role-rates  — admin-only, append-only versioning
//
// Auth strategy:
//   - GET reads via the user-context client; RLS (`role_rates_select_tenant_member`)
//     keeps cross-tenant rows invisible. No extra check — RLS-empty-result is the
//     correct response for non-members.
//   - POST runs an explicit `requireTenantAdmin` check on top of the
//     `role_rates_insert_admin` RLS policy. This produces a clean 403 instead
//     of letting the insert surface as a Postgres "policy violation" (42501).
//   - Synthetic INSERT-audit goes through the service-role admin client because
//     audit_log_entries' RLS only permits SELECT (mirrors PROJ-22 postings).

// GET /api/tenants/[id]/role-rates
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

  // RLS handles tenant boundary. role_key ASC, valid_from DESC = stable shape
  // for UI grouping (one logical row per role, history below).
  const { data, error } = await supabase
    .from("role_rates")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("role_key", { ascending: true })
    .order("valid_from", { ascending: false })
    .limit(1000)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ rates: data ?? [] })
}

// POST /api/tenants/[id]/role-rates
//   Admin-only. Append-only versioning: a "rate change" is a NEW row with a
//   newer valid_from. `role_rates_unique_per_role_and_date` UNIQUE prevents
//   duplicates per (tenant, role_key, valid_from).
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

  const adminError = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminError) return adminError

  const { data, error } = await supabase
    .from("role_rates")
    .insert({
      ...normalizeRoleRatePayload(parsed.data),
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
        "Ein Tagessatz für diese Rolle und dieses Gültigkeitsdatum existiert bereits.",
        409
      )
    }
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    return apiError("create_failed", error.message, 500)
  }

  // Synthetic INSERT-audit (best-effort, never blocks the response).
  await writeCostAuditEntry({
    tenantId,
    entity: "role_rates",
    entityId: data.id,
    action: "insert",
    oldValue: null,
    newValue: {
      role_key: data.role_key,
      daily_rate: data.daily_rate,
      currency: data.currency,
      valid_from: data.valid_from,
    },
    actorUserId: userId,
    reason: "Tagessatz angelegt",
  })

  return NextResponse.json({ rate: data }, { status: 201 })
}
