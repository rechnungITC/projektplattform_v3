import { NextResponse } from "next/server"
import { z } from "zod"

import { SKILL_VERSION_SELECT } from "@/types/skill"

import { resolveActiveTenantId } from "../../../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../_lib/route-helpers"

import { createVersionSchema, validationStatusFor } from "../../_schema"

// PROJ-76 — skill versions (admin only).
//
// GET  /api/skills/[id]/versions  — list all versions (draft/active/archived).
// POST /api/skills/[id]/versions  — create a new draft version
//      (version_number = max + 1). Content is immutable once written.

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

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const adminDenial = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminDenial) return adminDenial

  const { data, error } = await supabase
    .from("skill_versions")
    .select(SKILL_VERSION_SELECT)
    .eq("skill_id", id)
    .eq("tenant_id", tenantId)
    .order("version_number", { ascending: false })
    .limit(500)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ versions: data ?? [] })
}

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
  const parsed = createVersionSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    // PROJ-141-α5 (L-3) — unknown allowed_actions → 422 (semantic), not 400.
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      validationStatusFor(parsed.error.issues),
      first?.path?.[0]?.toString()
    )
  }

  // Confirm the skill exists in this tenant (RLS-scoped) before adding.
  const { data: skill, error: skillError } = await supabase
    .from("skills")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle()
  if (skillError) return apiError("fetch_failed", skillError.message, 500)
  if (!skill) return apiError("not_found", "Skill not found.", 404)

  // PROJ-77-α: at most one open draft per skill (app-layer guard — a DB
  // constraint would break the deployed rollback RPC, which transiently
  // creates a draft). Benign race: two concurrent creates → max 2 drafts.
  const { data: openDraft, error: draftErr } = await supabase
    .from("skill_versions")
    .select("id")
    .eq("skill_id", id)
    .eq("status", "draft")
    .limit(1)
    .maybeSingle()
  if (draftErr) return apiError("fetch_failed", draftErr.message, 500)
  if (openDraft) {
    return apiError(
      "conflict",
      "This skill already has an open draft — edit or publish it before creating another.",
      409,
      "status"
    )
  }

  const { data: last } = await supabase
    .from("skill_versions")
    .select("version_number")
    .eq("skill_id", id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextNumber =
    ((last as unknown as { version_number: number } | null)?.version_number ??
      0) + 1

  const { data, error } = await supabase
    .from("skill_versions")
    .insert({
      skill_id: id,
      tenant_id: tenantId,
      version_number: nextNumber,
      markdown_content: parsed.data.markdown_body ?? "",
      frontmatter: parsed.data.frontmatter ?? {},
      change_summary: parsed.data.change_summary ?? null,
      status: "draft",
      created_by: userId,
    })
    .select(SKILL_VERSION_SELECT)
    .single()

  if (error) {
    // Concurrent create raced us for the same version_number.
    if (error.code === "23505") {
      return apiError(
        "conflict",
        "A concurrent update created a version — please retry.",
        409,
        "version_number"
      )
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ version: data }, { status: 201 })
}
