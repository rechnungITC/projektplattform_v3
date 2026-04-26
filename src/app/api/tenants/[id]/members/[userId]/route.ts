import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../../_lib/route-helpers"

const rolePatchSchema = z.object({
  role: z.enum(["admin", "member", "viewer"]),
})

interface RouteContext {
  params: Promise<{ id: string; userId: string }>
}

/**
 * Maps the "Tenant must have at least one admin" trigger error to an
 * HTTP 422 with the trigger's own message.
 */
function isLastAdminError(message: string | undefined): boolean {
  return Boolean(message && message.includes("at least one admin"))
}

/**
 * PATCH /api/tenants/[id]/members/[userId]
 * Body: { role: 'admin' | 'member' | 'viewer' }
 *
 * Admin-only. The DB trigger enforce_admin_invariant blocks demoting the
 * last admin and is mapped to a 422 here.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const { id: tenantId, userId: targetUserId } = await context.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = rolePatchSchema.safeParse(body)
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

  const { data, error } = await supabase
    .from("tenant_memberships")
    .update({ role: parsed.data.role })
    .eq("tenant_id", tenantId)
    .eq("user_id", targetUserId)
    .select("id, tenant_id, user_id, role, created_at")
    .maybeSingle()

  if (error) {
    if (isLastAdminError(error.message)) {
      return apiError("last_admin", error.message, 422)
    }
    return apiError("update_failed", error.message, 500)
  }

  if (!data) {
    return apiError("not_found", "Membership not found.", 404)
  }

  return NextResponse.json({ membership: data }, { status: 200 })
}

/**
 * DELETE /api/tenants/[id]/members/[userId]
 * Admin-only. Last-admin removal blocked by the DB trigger -> 422.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const { id: tenantId, userId: targetUserId } = await context.params

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const denied = await requireTenantAdmin(supabase, tenantId, userId)
  if (denied) return denied

  const { data, error } = await supabase
    .from("tenant_memberships")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("user_id", targetUserId)
    .select("id")
    .maybeSingle()

  if (error) {
    if (isLastAdminError(error.message)) {
      return apiError("last_admin", error.message, 422)
    }
    return apiError("delete_failed", error.message, 500)
  }

  if (!data) {
    return apiError("not_found", "Membership not found.", 404)
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
