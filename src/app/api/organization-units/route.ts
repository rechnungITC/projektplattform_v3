import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
  requireTenantMember,
} from "../_lib/route-helpers"
import { resolveActiveTenantId } from "../_lib/active-tenant"

// PROJ-62 — Organization Unit collection endpoint.
// GET  /api/organization-units → tenant-member, flat list
// POST /api/organization-units → tenant-admin, create

const SELECT_COLUMNS =
  "id, tenant_id, parent_id, name, code, type, location_id, description, is_active, sort_order, created_at, updated_at"

const TYPE_VALUES = [
  "group",
  "company",
  "department",
  "team",
  "project_org",
  "external_org",
] as const

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(TYPE_VALUES),
  parent_id: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
  code: z.string().trim().max(50).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  sort_order: z.number().int().nullable().optional(),
})

export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const memberDenial = await requireTenantMember(supabase, tenantId, userId)
  if (memberDenial) return memberDenial

  const { data, error } = await supabase
    .from("organization_units")
    .select(SELECT_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true })
  if (error) return apiError("list_failed", error.message, 500)

  return NextResponse.json({ units: data ?? [] })
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
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString(),
    )
  }

  const { data, error } = await supabase
    .from("organization_units")
    .insert({
      tenant_id: tenantId,
      name: parsed.data.name,
      type: parsed.data.type,
      parent_id: parsed.data.parent_id ?? null,
      location_id: parsed.data.location_id ?? null,
      code: parsed.data.code ?? null,
      description: parsed.data.description ?? null,
      sort_order: parsed.data.sort_order ?? null,
    })
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "23505") {
      return apiError(
        "conflict",
        "An organization unit with this code already exists for your tenant.",
        409,
        "code",
      )
    }
    if (error.message.includes("cross_tenant_parent")) {
      return apiError("invalid_parent", "Parent belongs to a different tenant.", 400, "parent_id")
    }
    if (error.message.includes("parent_not_found")) {
      return apiError("invalid_parent", "Parent unit not found.", 400, "parent_id")
    }
    if (error.message.includes("cross_tenant_location")) {
      return apiError("invalid_location", "Location belongs to a different tenant.", 400, "location_id")
    }
    if (error.message.includes("location_not_found")) {
      return apiError("invalid_location", "Location not found.", 400, "location_id")
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ unit: data }, { status: 201 })
}
