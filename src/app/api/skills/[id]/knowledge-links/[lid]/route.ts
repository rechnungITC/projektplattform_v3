import { NextResponse } from "next/server"
import { z } from "zod"

import { SKILL_KNOWLEDGE_LINK_SELECT } from "@/types/skill"

import { resolveActiveTenantId } from "../../../../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../../_lib/route-helpers"

import { updateKnowledgeLinkSchema } from "../../../_schema"

// PROJ-77-γ — single skill knowledge link (admin only).
//
// PATCH  /api/skills/[id]/knowledge-links/[lid]  — edit include_subtree/link_mode.
// DELETE /api/skills/[id]/knowledge-links/[lid]  — remove the link.

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; lid: string }> }
) {
  const { id, lid } = await context.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid skill id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(lid).success) {
    return apiError("validation_error", "Invalid link id.", 400, "lid")
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
  const parsed = updateKnowledgeLinkSchema.safeParse(body)
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
  if (parsed.data.include_subtree !== undefined)
    patch.include_subtree = parsed.data.include_subtree
  if (parsed.data.link_mode !== undefined) patch.link_mode = parsed.data.link_mode

  const { data, error } = await supabase
    .from("skill_knowledge_links")
    .update(patch)
    .eq("id", lid)
    .eq("skill_id", id)
    .eq("tenant_id", tenantId)
    .select(SKILL_KNOWLEDGE_LINK_SELECT)
    .maybeSingle()

  if (error) return apiError("update_failed", error.message, 500)
  if (!data) return apiError("not_found", "Link not found.", 404)
  return NextResponse.json({ link: data })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; lid: string }> }
) {
  const { id, lid } = await context.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid skill id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(lid).success) {
    return apiError("validation_error", "Invalid link id.", 400, "lid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const adminDenial = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminDenial) return adminDenial

  const { error } = await supabase
    .from("skill_knowledge_links")
    .delete()
    .eq("id", lid)
    .eq("skill_id", id)
    .eq("tenant_id", tenantId)

  if (error) return apiError("delete_failed", error.message, 500)
  return NextResponse.json({ ok: true })
}
