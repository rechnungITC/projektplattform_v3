import { NextResponse } from "next/server"

import { resolveActiveTenantId } from "../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../_lib/route-helpers"

import { POLICY_SELECT, upsertPolicySchema } from "./_schema"

// PROJ-100c — 4-eyes approval policy catalog (tenant-scoped).
//
// GET /api/clearance-approval-policies — list the tenant's per-level policies
//     (any member; RLS scopes rows to the caller's tenant).
// PUT /api/clearance-approval-policies — upsert one level's policy (tenant-admin).
//     Empty/absent rows ⇒ gate off for that level (structural default-off).

export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data, error } = await supabase
    .from("ma_clearance_approval_policies")
    .select(POLICY_SELECT)
    .order("level", { ascending: true })
    .limit(100)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ policies: data ?? [] })
}

export async function PUT(request: Request) {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const adminDenial = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminDenial) return adminDenial

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = upsertPolicySchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { data, error } = await supabase
    .from("ma_clearance_approval_policies")
    .upsert(
      {
        tenant_id: tenantId,
        level: parsed.data.level,
        enabled: parsed.data.enabled,
        persons_required: parsed.data.persons_required,
        created_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,level" }
    )
    .select(POLICY_SELECT)
    .single()

  if (error) return apiError("upsert_failed", error.message, 500)
  return NextResponse.json({ policy: data })
}
