import { NextResponse } from "next/server"

import { SKILL_SELECT, SKILL_VERSION_SELECT } from "@/types/skill"

import { resolveActiveTenantId } from "../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../_lib/route-helpers"

import { createSkillSchema, validationStatusFor } from "./_schema"

// PROJ-76 — tenant Skill catalog.
//
// GET  /api/skills                 — list the active tenant's skills.
//      Members see active skills only (RLS); admins see active by default
//      and all with ?include_inactive=true.
// POST /api/skills                 — create a skill + its initial v1 draft
//      (tenant-admin only).

export async function GET(request: Request) {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const includeInactive =
    new URL(request.url).searchParams.get("include_inactive") === "true"

  let query = supabase
    .from("skills")
    .select(SKILL_SELECT)
    .eq("tenant_id", tenantId)
  // Members only ever see active rows via RLS; this narrows the admin
  // default to active-only unless the flag is passed.
  if (!includeInactive) query = query.eq("is_active", true)

  const { data, error } = await query
    .order("name", { ascending: true })
    .limit(500)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ skills: data ?? [] })
}

export async function POST(request: Request) {
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
  const parsed = createSkillSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    // PROJ-141-α5 (L-3) — unknown allowed_actions → 422 (semantic).
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      validationStatusFor(parsed.error.issues),
      first?.path?.[0]?.toString()
    )
  }

  const { data: skill, error: skillError } = await supabase
    .from("skills")
    .insert({
      tenant_id: tenantId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description ?? "",
      category: parsed.data.category,
      method_tags: parsed.data.method_tags ?? [],
      project_type_tags: parsed.data.project_type_tags ?? [],
      created_by: userId,
    })
    .select(SKILL_SELECT)
    .single()

  if (skillError) {
    if (skillError.code === "23505") {
      return apiError(
        "conflict",
        "A skill with this slug already exists for your tenant.",
        409,
        "slug"
      )
    }
    return apiError("create_failed", skillError.message, 500)
  }

  const skillRow = skill as unknown as { id: string }

  // Seed the initial v1 (draft). If this fails, roll back the skill so we
  // never leave a version-less catalog entry behind.
  const { data: version, error: versionError } = await supabase
    .from("skill_versions")
    .insert({
      skill_id: skillRow.id,
      tenant_id: tenantId,
      version_number: 1,
      markdown_content: parsed.data.markdown_body ?? "",
      frontmatter: parsed.data.frontmatter ?? {},
      status: "draft",
      created_by: userId,
    })
    .select(SKILL_VERSION_SELECT)
    .single()

  if (versionError) {
    await supabase.from("skills").delete().eq("id", skillRow.id)
    return apiError("create_failed", versionError.message, 500)
  }

  return NextResponse.json({ skill, version }, { status: 201 })
}
