import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../_lib/route-helpers"

// PROJ-62 — Organization Unit single endpoint.
// PATCH  /api/organization-units/[id]  → update (admin, optimistic-lock)
// DELETE /api/organization-units/[id]  → delete (admin, blocker-aware)

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

const patchSchema = z.object({
  expected_updated_at: z.string().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  type: z.enum(TYPE_VALUES).optional(),
  parent_id: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
  code: z.string().trim().max(50).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  sort_order: z.number().int().nullable().optional(),
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
    .from("organization_units")
    .select("id, tenant_id, updated_at")
    .eq("id", id)
    .maybeSingle()
  if (lookupError) return apiError("internal_error", lookupError.message, 500)
  if (!existing) return apiError("not_found", "Unit not found.", 404)

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
      "The unit was changed by someone else. Please refresh.",
      409,
    )
  }

  const { expected_updated_at: _ignored, ...updates } = parsed.data
  if (Object.keys(updates).length === 0) {
    return apiError("validation_error", "Empty patch body.", 400)
  }

  const { data, error } = await supabase
    .from("organization_units")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "23505") {
      return apiError(
        "conflict",
        "Code already in use within this tenant.",
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
    return apiError("update_failed", error.message, 500)
  }

  return NextResponse.json({ unit: data })
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: existing, error: lookupError } = await supabase
    .from("organization_units")
    .select("id, tenant_id, name")
    .eq("id", id)
    .maybeSingle()
  if (lookupError) return apiError("internal_error", lookupError.message, 500)
  if (!existing) return apiError("not_found", "Unit not found.", 404)

  const adminDenial = await requireTenantAdmin(
    supabase,
    existing.tenant_id as string,
    userId,
  )
  if (adminDenial) return adminDenial

  // Pre-check dependencies so we can return a structured blocker
  // payload to the UI (instead of raw FK error messages).
  const [
    childrenRes,
    stakeholderRes,
    resourceRes,
    memberRes,
  ] = await Promise.all([
    supabase
      .from("organization_units")
      .select("id, name", { count: "exact" })
      .eq("parent_id", id)
      .limit(5),
    supabase
      .from("stakeholders")
      .select("id, name", { count: "exact" })
      .eq("organization_unit_id", id)
      .limit(5),
    supabase
      .from("resources")
      .select("id, name", { count: "exact" })
      .eq("organization_unit_id", id)
      .limit(5),
    supabase
      .from("tenant_memberships")
      .select("user_id", { count: "exact" })
      .eq("organization_unit_id", id)
      .limit(5),
  ])

  const blockers: Array<{
    kind: "children" | "stakeholders" | "resources" | "tenant_members"
    count: number
    sample: string[]
  }> = []

  if ((childrenRes.count ?? 0) > 0) {
    blockers.push({
      kind: "children",
      count: childrenRes.count ?? 0,
      sample: (childrenRes.data ?? []).map((r) => (r.name as string) ?? ""),
    })
  }
  if ((stakeholderRes.count ?? 0) > 0) {
    blockers.push({
      kind: "stakeholders",
      count: stakeholderRes.count ?? 0,
      sample: (stakeholderRes.data ?? []).map((r) => (r.name as string) ?? ""),
    })
  }
  if ((resourceRes.count ?? 0) > 0) {
    blockers.push({
      kind: "resources",
      count: resourceRes.count ?? 0,
      sample: (resourceRes.data ?? []).map((r) => (r.name as string) ?? ""),
    })
  }
  if ((memberRes.count ?? 0) > 0) {
    blockers.push({
      kind: "tenant_members",
      count: memberRes.count ?? 0,
      sample: [],
    })
  }

  if (blockers.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: "has_dependencies",
          message: "Unit has dependent rows; remove or move them first.",
        },
        blockers,
      },
      { status: 409 },
    )
  }

  const { error: deleteError } = await supabase
    .from("organization_units")
    .delete()
    .eq("id", id)

  if (deleteError) {
    return apiError("delete_failed", deleteError.message, 500)
  }

  return new NextResponse(null, { status: 204 })
}
