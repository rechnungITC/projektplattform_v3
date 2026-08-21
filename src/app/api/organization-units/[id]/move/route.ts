import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
} from "../../../_lib/route-helpers"

// PROJ-62 — Atomic move via SECURITY DEFINER RPC `move_organization_unit`.
// The RPC enforces tenant-admin auth + same-tenant + cycle + optimistic-lock
// in a single transaction (Tech-Design Lock 2).
//
// PROJ-Y-143n — this route had no tenant reference of its own at all: the RPC
// was the only thing gating it. A module gate needs a tenant, so the route now
// resolves one the same way its PATCH/DELETE siblings do — by loading the unit
// it is about to move. Deliberately *not* via `resolveActiveTenantId`: that
// would be a second, different notion of "which tenant is this about" for the
// same object, and could consult the wrong tenant's module settings.
//
// The RPC keeps every check it had. The route adds one gate and takes nothing
// away — it cannot, since the RPC re-derives tenant, admin role, same-tenant
// parent, cycles and the optimistic lock from `auth.uid()` internally.
//
// Two visible consequences of putting the lookup first, both deliberate:
//   * A unit the caller cannot see through RLS now answers 404 before the RPC
//     is reached, where the DEFINER RPC used to see the row and answer 403.
//     That is the sibling handlers' behaviour and leaks less, not more.
//   * With the module off, a malformed body answers 403 rather than 400: the
//     gate runs before validation, as it does on every other gated route.

const moveSchema = z.object({
  new_parent_id: z.string().uuid().nullable(),
  expected_updated_at: z.string().min(1),
})

interface Ctx {
  params: Promise<{ id: string }>
}

const SELECT_COLUMNS =
  "id, tenant_id, parent_id, name, code, type, location_id, description, is_active, sort_order, created_at, updated_at"

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // The unit is the tenant anchor — see the header note.
  const { data: existing, error: lookupError } = await supabase
    .from("organization_units")
    .select("id, tenant_id")
    .eq("id", id)
    .maybeSingle()
  if (lookupError) return apiError("internal_error", lookupError.message, 500)
  if (!existing) return apiError("not_found", "Unit not found.", 404)

  const moduleDenial = await requireModuleActive(
    supabase,
    existing.tenant_id as string,
    "organization",
    { intent: "write" },
  )
  if (moduleDenial) return moduleDenial

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = moveSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString(),
    )
  }

  const { data, error } = await supabase.rpc("move_organization_unit", {
    p_unit_id: id,
    p_new_parent_id: parsed.data.new_parent_id,
    p_expected_updated_at: parsed.data.expected_updated_at,
  })

  if (error) {
    const message = error.message ?? ""
    if (message.includes("unit_not_found")) {
      return apiError("not_found", "Unit not found.", 404)
    }
    if (message.includes("forbidden")) {
      return apiError("forbidden", "Tenant admin role required.", 403)
    }
    if (message.includes("version_conflict")) {
      return apiError(
        "version_conflict",
        "The unit was changed by someone else. Please refresh.",
        409,
      )
    }
    if (message.includes("cycle_detected")) {
      return apiError(
        "cycle_detected",
        "Move would create a cycle.",
        409,
        "new_parent_id",
      )
    }
    if (message.includes("cross_tenant_parent")) {
      return apiError(
        "invalid_parent",
        "Parent belongs to a different tenant.",
        400,
        "new_parent_id",
      )
    }
    if (message.includes("parent_not_found")) {
      return apiError(
        "invalid_parent",
        "Parent unit not found.",
        400,
        "new_parent_id",
      )
    }
    return apiError("move_failed", message, 500)
  }

  // Supabase RPC returning a row type yields the row directly.
  // Re-select to ensure we surface the standard column shape.
  const { data: refreshed, error: refreshErr } = await supabase
    .from("organization_units")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle()
  if (refreshErr || !refreshed) {
    return NextResponse.json({ unit: data })
  }

  return NextResponse.json({ unit: refreshed })
}
