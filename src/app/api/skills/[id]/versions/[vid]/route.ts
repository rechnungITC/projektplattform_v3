import { NextResponse } from "next/server"
import { z } from "zod"

import { SKILL_VERSION_SELECT } from "@/types/skill"

import { resolveActiveTenantId } from "../../../../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../../_lib/route-helpers"

import { patchVersionSchema } from "../../../_schema"

// PROJ-77-α — edit a DRAFT version in place (tenant-admin only).
//
// PATCH /api/skills/[id]/versions/[vid]
//   - only permitted while the version is `draft` (409 otherwise); active/
//     archived stay immutable (DB trigger blocks them regardless).
//   - optimistic concurrency: send `If-Match: <updated_at>`; a stale value →
//     409 (the draft changed underneath you). The DB trigger allows the edit
//     because the row stays draft; `updated_at` auto-bumps (moddatetime).

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; vid: string }> }
) {
  const { id, vid } = await context.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid skill id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(vid).success) {
    return apiError("validation_error", "Invalid version id.", 400, "vid")
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
  const parsed = patchVersionSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { data: current, error: fetchErr } = await supabase
    .from("skill_versions")
    .select("id, status, updated_at")
    .eq("id", vid)
    .eq("skill_id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle()
  if (fetchErr) return apiError("fetch_failed", fetchErr.message, 500)
  if (!current) return apiError("not_found", "Version not found.", 404)

  const version = current as unknown as { status: string; updated_at: string }
  if (version.status !== "draft") {
    return apiError(
      "conflict",
      "Only draft versions can be edited. Published versions are immutable — create a new draft.",
      409,
      "status"
    )
  }

  const ifMatch = request.headers.get("if-match")
  if (ifMatch && ifMatch !== version.updated_at) {
    return apiError(
      "conflict",
      "This draft changed since you loaded it. Reload and reapply your edit.",
      409,
      "updated_at"
    )
  }

  const patch: Record<string, unknown> = {}
  if (parsed.data.markdown_body !== undefined)
    patch.markdown_content = parsed.data.markdown_body
  if (parsed.data.frontmatter !== undefined)
    patch.frontmatter = parsed.data.frontmatter
  if (parsed.data.change_summary !== undefined)
    patch.change_summary = parsed.data.change_summary ?? null

  // Guard the write by the seen updated_at (race-safe) + status='draft'.
  let query = supabase
    .from("skill_versions")
    .update(patch)
    .eq("id", vid)
    .eq("tenant_id", tenantId)
    .eq("status", "draft")
  if (ifMatch) query = query.eq("updated_at", ifMatch)

  const { data, error } = await query.select(SKILL_VERSION_SELECT).maybeSingle()

  if (error) return apiError("update_failed", error.message, 500)
  if (!data) {
    // Row moved out from under us (published or concurrently edited).
    return apiError(
      "conflict",
      "This draft changed since you loaded it. Reload and reapply your edit.",
      409,
      "updated_at"
    )
  }

  return NextResponse.json({ version: data })
}
