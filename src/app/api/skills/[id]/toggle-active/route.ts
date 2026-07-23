import { NextResponse } from "next/server"
import { z } from "zod"

import { SKILL_SELECT } from "@/types/skill"

import { resolveActiveTenantId } from "../../../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../_lib/route-helpers"

import { toggleActiveSchema } from "../../_schema"

// PROJ-76 — flip a skill's active flag (staging control, tenant-admin only).
// Independent of version activation: an inactive skill stays hidden from PMs
// even if it has an active version.

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid skill id.", 400, "id")
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
  const parsed = toggleActiveSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_error", "`is_active` (boolean) required.", 400, "is_active")
  }

  const { data, error } = await supabase
    .from("skills")
    .update({ is_active: parsed.data.is_active })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select(SKILL_SELECT)
    .maybeSingle()

  if (error) return apiError("update_failed", error.message, 500)
  if (!data) return apiError("not_found", "Skill not found.", 404)

  return NextResponse.json({ skill: data })
}
