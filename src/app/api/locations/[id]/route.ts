import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../_lib/route-helpers"

// PROJ-62 — Locations single endpoint.
// PATCH  /api/locations/[id]  → update (admin, optimistic-lock)
// DELETE /api/locations/[id]  → delete (admin, blocker-aware)

const SELECT_COLUMNS =
  "id, tenant_id, name, country, city, address, is_active, created_at, updated_at"

const patchSchema = z.object({
  expected_updated_at: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  country: z.string().trim().max(80).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  is_active: z.boolean().optional(),
})

interface Ctx {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: existing, error: lookupError } = await supabase
    .from("locations")
    .select("id, tenant_id, updated_at")
    .eq("id", id)
    .maybeSingle()
  if (lookupError) return apiError("internal_error", lookupError.message, 500)
  if (!existing) return apiError("not_found", "Location not found.", 404)

  const adminDenial = await requireTenantAdmin(
    supabase,
    existing.tenant_id as string,
    userId,
  )
  if (adminDenial) return adminDenial

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString(),
    )
  }

  if (existing.updated_at !== parsed.data.expected_updated_at) {
    return apiError(
      "version_conflict",
      "The location was changed by someone else. Please refresh.",
      409,
    )
  }

  const { expected_updated_at: _ignored, ...updates } = parsed.data
  if (Object.keys(updates).length === 0) {
    return apiError("validation_error", "Empty patch body.", 400)
  }

  const { data, error } = await supabase
    .from("locations")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single()

  if (error) return apiError("update_failed", error.message, 500)

  return NextResponse.json({ location: data })
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: existing, error: lookupError } = await supabase
    .from("locations")
    .select("id, tenant_id, name")
    .eq("id", id)
    .maybeSingle()
  if (lookupError) return apiError("internal_error", lookupError.message, 500)
  if (!existing) return apiError("not_found", "Location not found.", 404)

  const adminDenial = await requireTenantAdmin(
    supabase,
    existing.tenant_id as string,
    userId,
  )
  if (adminDenial) return adminDenial

  // Block delete if any organization_unit still references this location.
  const { data: refs, count } = await supabase
    .from("organization_units")
    .select("id, name", { count: "exact" })
    .eq("location_id", id)
    .limit(5)
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error: {
          code: "has_dependencies",
          message: "Location is still referenced by organization units.",
        },
        blockers: [
          {
            kind: "locations",
            count: count ?? 0,
            sample: (refs ?? []).map((r) => (r.name as string) ?? ""),
          },
        ],
      },
      { status: 409 },
    )
  }

  const { error: deleteError } = await supabase
    .from("locations")
    .delete()
    .eq("id", id)

  if (deleteError) return apiError("delete_failed", deleteError.message, 500)

  return new NextResponse(null, { status: 204 })
}