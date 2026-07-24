import { NextResponse } from "next/server"
import { z } from "zod"

import { SKILL_SELECT, SKILL_VERSION_SELECT } from "@/types/skill"

import { resolveActiveTenantId } from "../../../../../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../../../_lib/route-helpers"

// PROJ-76 — rollback to a version (tenant-admin only).
// Creates a NEW draft version copied from the target, then activates it.
// Historical rows are never mutated. Returns the new version + skill.

export async function POST(
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

  const { data: version, error: vErr } = await supabase
    .from("skill_versions")
    .select("id")
    .eq("id", vid)
    .eq("skill_id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle()
  if (vErr) return apiError("fetch_failed", vErr.message, 500)
  if (!version) return apiError("not_found", "Version not found.", 404)

  const { data: newId, error } = await supabase.rpc("rollback_skill_version", {
    p_version_id: vid,
  })
  if (error) {
    if (error.code === "42501")
      return apiError("forbidden", "Admin role required.", 403)
    if (error.code === "P0002")
      return apiError("not_found", "Version not found.", 404)
    return apiError("rollback_failed", error.message, 500)
  }

  const [{ data: skill }, { data: created }] = await Promise.all([
    supabase.from("skills").select(SKILL_SELECT).eq("id", id).maybeSingle(),
    supabase
      .from("skill_versions")
      .select(SKILL_VERSION_SELECT)
      .eq("id", newId as unknown as string)
      .maybeSingle(),
  ])

  return NextResponse.json({ skill, version: created }, { status: 201 })
}
