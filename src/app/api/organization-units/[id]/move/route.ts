import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
} from "../../../_lib/route-helpers"

// PROJ-62 — Atomic move via SECURITY DEFINER RPC `move_organization_unit`.
// The RPC enforces tenant-admin auth + same-tenant + cycle + optimistic-lock
// in a single transaction (Tech-Design Lock 2).

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
