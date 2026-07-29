import { NextResponse } from "next/server"
import { z } from "zod"

import { SKILL_VERSION_SELECT } from "@/types/skill"

import { resolveActiveTenantId } from "../../../../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../../_lib/route-helpers"

import {
  patchVersionSchema,
  validationStatusFor,
} from "../../../_schema"

// PROJ-77-α — edit a DRAFT version in place (tenant-admin only).
// PROJ-141-α2 (M-9) — If-Match is now REQUIRED; missing header → 428.
// PROJ-141-α5 (L-3) — unknown `allowed_actions` returns 422 (not 400).
// PROJ-141-α4 (M-11) — DELETE discards a draft (audit event: discarded).
//
// PATCH /api/skills/[id]/versions/[vid]
//   - only permitted while the version is `draft` (409 otherwise); active/
//     archived stay immutable (DB trigger blocks them regardless).
//   - `If-Match: <updated_at>` is required (428 if missing, 409 if stale).
//     The DB trigger allows the edit because the row stays draft; `updated_at`
//     auto-bumps (moddatetime).
//
// DELETE /api/skills/[id]/versions/[vid]
//   - admin-only, only for status='draft' — the deployed `discard_skill_draft`
//     RPC gates + hard-deletes + writes the skill_version.draft_discarded
//     audit event. active/archived stay untouched.

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
      validationStatusFor(parsed.error.issues),
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

  // PROJ-141-α2 — If-Match is required; a missing header is a client bug
  // (the official client always sends it). Fail fast with 428.
  const ifMatch = request.headers.get("if-match")
  if (!ifMatch) {
    return apiError(
      "precondition_required",
      "If-Match header with the version's updated_at is required.",
      428,
      "if-match"
    )
  }
  if (ifMatch !== version.updated_at) {
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
  const query = supabase
    .from("skill_versions")
    .update(patch)
    .eq("id", vid)
    .eq("tenant_id", tenantId)
    .eq("status", "draft")
    .eq("updated_at", ifMatch)

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

export async function DELETE(
  _request: Request,
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

  // Sanity-scope + friendlier 404 vs. the RPC's opaque P0002 (RLS filters
  // cross-tenant reads to nothing already).
  const { data: version, error: vErr } = await supabase
    .from("skill_versions")
    .select("id")
    .eq("id", vid)
    .eq("skill_id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle()
  if (vErr) return apiError("fetch_failed", vErr.message, 500)
  if (!version) return apiError("not_found", "Version not found.", 404)

  const { error } = await supabase.rpc("discard_skill_draft", {
    p_version_id: vid,
  })
  if (error) {
    if (error.code === "42501")
      return apiError("forbidden", "Admin role required.", 403)
    if (error.code === "P0002")
      return apiError("not_found", "Version not found.", 404)
    if (error.code === "P0001")
      return apiError(
        "conflict",
        "Only draft versions can be discarded. Published or archived versions are immutable.",
        409,
        "status"
      )
    return apiError("discard_failed", error.message, 500)
  }

  return new NextResponse(null, { status: 204 })
}
