import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"
import {
  normalizeStakeholderPayload,
  stakeholderPatchSchema as patchSchema,
} from "../_schema"

// PROJ-8 — single-stakeholder endpoints.
// GET   /api/projects/[id]/stakeholders/[sid]
// PATCH /api/projects/[id]/stakeholders/[sid]
// Schema lives in `../_schema.ts` so the drift-test can introspect it.

interface Ctx {
  params: Promise<{ id: string; sid: string }>
}

// -----------------------------------------------------------------------------
// GET
// -----------------------------------------------------------------------------

export async function GET(_request: Request, ctx: Ctx) {
  const { id: projectId, sid } = await ctx.params
  if (!z.string().uuid().safeParse(sid).success) {
    return apiError("validation_error", "Invalid stakeholder id.", 400, "sid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("stakeholders")
    .select(
      "id, tenant_id, project_id, kind, origin, name, role_key, org_unit, contact_email, contact_phone, influence, impact, linked_user_id, notes, is_active, is_approver, reasoning, stakeholder_type_key, management_level, decision_authority, attitude, conflict_potential, communication_need, preferred_channel, created_by, created_at, updated_at"
    )
    .eq("project_id", projectId)
    .eq("id", sid)
    .maybeSingle()

  if (error) {
    return apiError("read_failed", error.message, 500)
  }
  if (!data) {
    return apiError("not_found", "Stakeholder not found.", 404)
  }
  return NextResponse.json({ stakeholder: data })
}

// -----------------------------------------------------------------------------
// PATCH
// -----------------------------------------------------------------------------

export async function PATCH(request: Request, ctx: Ctx) {
  const { id: projectId, sid } = await ctx.params
  if (!z.string().uuid().safeParse(sid).success) {
    return apiError("validation_error", "Invalid stakeholder id.", 400, "sid")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = patchSchema.safeParse(body)
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

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  // Spread-Pattern: parsed.data only contains fields the client actually
  // sent (PATCH-semantics). Spread + normalize handles every schema field
  // automatically — no manual `if (data.X !== undefined) update.X = ...`
  // chain to forget. New schema fields flow through automatically.
  //
  // Drift-test in route.test.ts asserts every schema key lands in the DB
  // payload, so any future field that fails to propagate fails CI loudly.
  const update = normalizeStakeholderPayload(parsed.data)

  const { data: row, error } = await supabase
    .from("stakeholders")
    .update(update)
    .eq("project_id", projectId)
    .eq("id", sid)
    .select()
    .single()

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") {
      return apiError("not_found", "Stakeholder not found.", 404)
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("update_failed", error.message, 500)
  }
  return NextResponse.json({ stakeholder: row })
}
