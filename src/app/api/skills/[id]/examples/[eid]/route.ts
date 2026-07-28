import { NextResponse } from "next/server"
import { z } from "zod"

import { SKILL_EXAMPLE_SELECT } from "@/types/skill"

import { resolveActiveTenantId } from "../../../../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../../_lib/route-helpers"

import { updateExampleSchema } from "../../../_schema"

// PROJ-77-β — single skill example (admin only).
//
// PATCH  /api/skills/[id]/examples/[eid]  — edit title/input/output/tags/order.
// DELETE /api/skills/[id]/examples/[eid]  — remove.

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; eid: string }> }
) {
  const { id, eid } = await context.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid skill id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(eid).success) {
    return apiError("validation_error", "Invalid example id.", 400, "eid")
  }

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
  const parsed = updateExampleSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const patch: Record<string, unknown> = {}
  if (parsed.data.title !== undefined) patch.title = parsed.data.title
  if (parsed.data.input !== undefined) patch.input = parsed.data.input
  if (parsed.data.expected_output !== undefined)
    patch.expected_output = parsed.data.expected_output
  if (parsed.data.tags !== undefined) patch.tags = parsed.data.tags
  if (parsed.data.display_order !== undefined)
    patch.display_order = parsed.data.display_order

  const { data, error } = await supabase
    .from("skill_examples")
    .update(patch)
    .eq("id", eid)
    .eq("skill_id", id)
    .eq("tenant_id", tenantId)
    .select(SKILL_EXAMPLE_SELECT)
    .maybeSingle()

  if (error) return apiError("update_failed", error.message, 500)
  if (!data) return apiError("not_found", "Example not found.", 404)
  return NextResponse.json({ example: data })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; eid: string }> }
) {
  const { id, eid } = await context.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid skill id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(eid).success) {
    return apiError("validation_error", "Invalid example id.", 400, "eid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const adminDenial = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminDenial) return adminDenial

  const { error } = await supabase
    .from("skill_examples")
    .delete()
    .eq("id", eid)
    .eq("skill_id", id)
    .eq("tenant_id", tenantId)

  if (error) return apiError("delete_failed", error.message, 500)
  return NextResponse.json({ ok: true })
}
