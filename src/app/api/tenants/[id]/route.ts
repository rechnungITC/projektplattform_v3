import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../_lib/route-helpers"

// At least one field must be provided. We validate "at least one" via
// .refine() AFTER the field-level checks so per-field error messages still
// surface for the common case.
const tenantPatchSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    domain: z.string().min(1).max(255).nullable().optional(),
  })
  .refine(
    (val) => val.name !== undefined || val.domain !== undefined,
    { message: "Provide at least one of: name, domain." }
  )

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * PATCH /api/tenants/[id]
 * Body: { name?: string, domain?: string | null }
 *
 * Admin-only. Uses the user-context client so the tenants UPDATE policy
 * (which checks is_tenant_admin) is the second line of defense.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const { id: tenantId } = await context.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = tenantPatchSchema.safeParse(body)
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

  // Build the update payload from only-provided fields.
  const updates: Record<string, string | null> = {}
  if (parsed.data.name !== undefined) updates.name = parsed.data.name
  if (parsed.data.domain !== undefined) {
    updates.domain =
      parsed.data.domain === null ? null : parsed.data.domain.trim().toLowerCase()
  }

  const { data, error } = await supabase
    .from("tenants")
    .update(updates)
    .eq("id", tenantId)
    .select("id, name, domain, created_at, created_by")
    .maybeSingle()

  if (error) {
    // Postgres unique-violation on tenants_domain_unique => domain taken.
    if (error.code === "23505") {
      return apiError(
        "domain_taken",
        "That domain is already claimed by another workspace.",
        409,
        "domain"
      )
    }
    return apiError("update_failed", error.message, 500)
  }

  if (!data) {
    return apiError("not_found", "Tenant not found.", 404)
  }

  return NextResponse.json({ tenant: data }, { status: 200 })
}
