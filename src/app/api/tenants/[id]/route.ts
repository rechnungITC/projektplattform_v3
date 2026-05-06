import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../_lib/route-helpers"

const brandingSchema = z
  .object({
    logo_url: z
      .string()
      .url()
      .startsWith("https://", "Logo URL must be HTTPS")
      .max(500)
      .nullable()
      .optional(),
    accent_color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, "Accent color must be a #RRGGBB hex string")
      .nullable()
      .optional(),
  })
  .strict()

// PROJ-53-β: ISO-3166 country with optional subdivision (e.g. "DE-NW",
// "AT", "CH-ZH"). Mirrors the DB CHECK constraint. NULL clears the field
// → Gantt falls back to weekend-only behaviour.
const HOLIDAY_REGION_RE = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/

// At least one field must be provided. We validate "at least one" via
// .refine() AFTER the field-level checks so per-field error messages still
// surface for the common case.
const tenantPatchSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    domain: z.string().min(1).max(255).nullable().optional(),
    language: z.enum(["de", "en"]).optional(),
    branding: brandingSchema.optional(),
    holiday_region: z
      .string()
      .regex(HOLIDAY_REGION_RE, "Region muss ISO-3166-Format haben (z. B. DE-NW, AT, CH-ZH).")
      .max(20)
      .nullable()
      .optional(),
  })
  .refine(
    (val) =>
      val.name !== undefined ||
      val.domain !== undefined ||
      val.language !== undefined ||
      val.branding !== undefined ||
      val.holiday_region !== undefined,
    {
      message:
        "Provide at least one of: name, domain, language, branding, holiday_region.",
    }
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
  const updates: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) updates.name = parsed.data.name
  if (parsed.data.domain !== undefined) {
    updates.domain =
      parsed.data.domain === null ? null : parsed.data.domain.trim().toLowerCase()
  }
  if (parsed.data.language !== undefined) updates.language = parsed.data.language
  if (parsed.data.branding !== undefined) updates.branding = parsed.data.branding
  if (parsed.data.holiday_region !== undefined) {
    updates.holiday_region = parsed.data.holiday_region
  }

  const { data, error } = await supabase
    .from("tenants")
    .update(updates)
    .eq("id", tenantId)
    .select(
      "id, name, domain, language, branding, holiday_region, created_at, created_by"
    )
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
