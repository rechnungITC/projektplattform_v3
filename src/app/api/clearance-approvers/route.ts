import { NextResponse } from "next/server"
import { z } from "zod"

import { resolveActiveTenantId } from "../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../_lib/route-helpers"

// PROJ-100c — tenant-wide named approver pool for the 4-eyes gate.
//
// GET  /api/clearance-approvers — list the tenant's approvers (member; RLS-scoped).
// POST /api/clearance-approvers — add an approver (tenant-admin). level null = all gated levels.

const APPROVER_SELECT =
  "id, tenant_id, level, approver_user_id, created_by, created_at"

const addApproverSchema = z.object({
  approver_user_id: z.string().uuid(),
  level: z.enum(["confidential", "strict"]).nullish(),
})

export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data, error } = await supabase
    .from("ma_clearance_approvers")
    .select(APPROVER_SELECT)
    .order("created_at", { ascending: true })
    .limit(500)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ approvers: data ?? [] })
}

export async function POST(request: Request) {
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
  const parsed = addApproverSchema.safeParse(body)
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
    .from("ma_clearance_approvers")
    .insert({
      tenant_id: tenantId,
      level: parsed.data.level ?? null,
      approver_user_id: parsed.data.approver_user_id,
      created_by: userId,
    })
    .select(APPROVER_SELECT)
    .single()

  if (error) {
    if (error.code === "23505") {
      return apiError("conflict", "This approver is already in the pool for that level.", 409)
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ approver: data }, { status: 201 })
}
