import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
  requireTenantMember,
} from "../_lib/route-helpers"
import { resolveActiveTenantId } from "../_lib/active-tenant"

// PROJ-62 — Locations collection endpoint.
// GET  /api/locations  → list (member)
// POST /api/locations  → create (admin)

const SELECT_COLUMNS =
  "id, tenant_id, name, code, country, city, address, import_id, is_active, created_at, updated_at"

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(50).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
})

export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const memberDenial = await requireTenantMember(supabase, tenantId, userId)
  if (memberDenial) return memberDenial

  const { data, error } = await supabase
    .from("locations")
    .select(SELECT_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true })
  if (error) return apiError("list_failed", error.message, 500)

  return NextResponse.json({ locations: data ?? [] })
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
    .from("locations")
    .insert({
      tenant_id: tenantId,
      name: parsed.data.name,
      code: parsed.data.code || null,
      country: parsed.data.country ?? null,
      city: parsed.data.city ?? null,
      address: parsed.data.address ?? null,
    })
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "23505") {
      return apiError("duplicate_code", "Location code already exists.", 409, "code")
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ location: data }, { status: 201 })
}
