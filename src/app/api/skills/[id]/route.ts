import { NextResponse } from "next/server"
import { z } from "zod"

import { SKILL_SELECT, SKILL_VERSION_SELECT } from "@/types/skill"

import { resolveActiveTenantId } from "../../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../_lib/route-helpers"

import { updateSkillMetadataSchema } from "../_schema"

// PROJ-76 — single skill.
//
// GET   /api/skills/[id]  — skill + its current active version (if any).
//       RLS scopes access (cross-tenant / inactive-for-member → 404).
// PATCH /api/skills/[id]  — update metadata only (name/description/tags/
//       category). Never the markdown body (that is a new version).
//       Tenant-admin only. `slug` is immutable.

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid skill id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: skill, error } = await supabase
    .from("skills")
    .select(SKILL_SELECT)
    .eq("id", id)
    .maybeSingle()

  if (error) return apiError("fetch_failed", error.message, 500)
  if (!skill) return apiError("not_found", "Skill not found.", 404)

  const currentVersionId = (skill as unknown as { current_version_id: string | null })
    .current_version_id

  let version: unknown = null
  if (currentVersionId) {
    const { data: v } = await supabase
      .from("skill_versions")
      .select(SKILL_VERSION_SELECT)
      .eq("id", currentVersionId)
      .maybeSingle()
    version = v ?? null
  }

  return NextResponse.json({ skill, version })
}

export async function PATCH(
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
  const parsed = updateSkillMetadataSchema.safeParse(body)
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
  if (parsed.data.name !== undefined) patch.name = parsed.data.name
  if (parsed.data.description !== undefined)
    patch.description = parsed.data.description
  if (parsed.data.category !== undefined) patch.category = parsed.data.category
  if (parsed.data.method_tags !== undefined)
    patch.method_tags = parsed.data.method_tags
  if (parsed.data.project_type_tags !== undefined)
    patch.project_type_tags = parsed.data.project_type_tags

  const { data, error } = await supabase
    .from("skills")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select(SKILL_SELECT)
    .maybeSingle()

  if (error) return apiError("update_failed", error.message, 500)
  if (!data) return apiError("not_found", "Skill not found.", 404)

  return NextResponse.json({ skill: data })
}
