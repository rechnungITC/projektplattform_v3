import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"

/**
 * Tenant-level polymorphic dependencies — PROJ-9 Round 2.
 *
 * This endpoint is for callers that already speak the polymorphic shape
 * (e.g. PROJ-25 Gantt-DnD, cross-project edges). The project-scoped wrapper
 * at `/api/projects/[id]/dependencies` remains for legacy callers.
 *
 * Database guarantees (defense in depth via triggers — see migration
 * `20260503200000_proj9r2_polymorphic_dependencies.sql`):
 *   - polymorphic FK existence (`tg_dep_validate_polymorphic_fk`)
 *   - cross-tenant block (`tg_dep_validate_tenant_boundary`)
 *   - cycle prevention (`tg_dep_prevent_polymorphic_cycle`)
 *   - UNIQUE (from_type, from_id, to_type, to_id, constraint_type)
 *   - no self-edge
 */

const schema = z.object({
  tenant_id: z.string().uuid(),
  from_type: z.enum(["project", "phase", "work_package", "todo"]),
  from_id: z.string().uuid(),
  to_type: z.enum(["project", "phase", "work_package", "todo"]),
  to_id: z.string().uuid(),
  constraint_type: z.enum(["FS", "SS", "FF", "SF"]).default("FS"),
  lag_days: z.number().int().optional(),
})

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be JSON.", 400)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const f = parsed.error.issues[0]
    return apiError(
      "validation_error",
      f?.message ?? "Invalid body.",
      400,
      f?.path?.[0]?.toString()
    )
  }

  if (
    parsed.data.from_type === parsed.data.to_type &&
    parsed.data.from_id === parsed.data.to_id
  ) {
    return apiError(
      "self_dependency",
      "from-entity and to-entity must differ.",
      422,
      "to_id"
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // Tenant-membership check — RLS would also reject, but the explicit pre-
  // check returns a cleaner 403 instead of a 42501 surfacing as 500.
  const { data: membership, error: memErr } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("tenant_id", parsed.data.tenant_id)
    .eq("user_id", userId)
    .maybeSingle()
  if (memErr) return apiError("internal_error", memErr.message, 500)
  if (!membership) {
    return apiError("forbidden", "Not a member of this tenant.", 403)
  }

  const { data: row, error } = await supabase
    .from("dependencies")
    .insert({
      tenant_id: parsed.data.tenant_id,
      from_type: parsed.data.from_type,
      from_id: parsed.data.from_id,
      to_type: parsed.data.to_type,
      to_id: parsed.data.to_id,
      constraint_type: parsed.data.constraint_type,
      lag_days: parsed.data.lag_days ?? 0,
      created_by: userId,
    })
    .select()
    .single()

  if (error) {
    if (error.code === "23505") {
      return apiError(
        "duplicate_dependency",
        "This dependency already exists.",
        422
      )
    }
    if (error.code === "23514") {
      const message = error.message ?? ""
      if (message.toLowerCase().includes("cycle")) {
        return apiError(
          "cycle_detected",
          "This dependency would create a cycle.",
          422
        )
      }
      return apiError("check_violation", message, 422)
    }
    if (error.code === "22023") {
      const message = error.message ?? ""
      if (message.toLowerCase().includes("cross-tenant")) {
        return apiError(
          "cross_tenant",
          "Cross-tenant dependencies are not allowed.",
          422
        )
      }
      return apiError("invalid_reference", message, 422)
    }
    if (error.code === "23503") {
      return apiError(
        "invalid_reference",
        "Referenced entity does not exist.",
        422
      )
    }
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("create_failed", error.message, 500)
  }
  return NextResponse.json({ dependency: row }, { status: 201 })
}
