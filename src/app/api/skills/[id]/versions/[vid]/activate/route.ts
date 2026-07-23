import { NextResponse } from "next/server"
import { z } from "zod"

import { SKILL_SELECT, SKILL_VERSION_SELECT } from "@/types/skill"

import { resolveActiveTenantId } from "../../../../../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../../../_lib/route-helpers"

// PROJ-76 — activate a skill version (tenant-admin only).
// Demotes the current active version to archived and repoints the skill's
// current-version pointer, atomically, via the SECURITY DEFINER RPC.

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

  const { error } = await supabase.rpc("activate_skill_version", {
    p_version_id: vid,
  })
  if (error) {
    if (error.code === "42501")
      return apiError("forbidden", "Admin role required.", 403)
    if (error.code === "P0002")
      return apiError("not_found", "Version not found.", 404)
    return apiError("activate_failed", error.message, 500)
  }

  const [{ data: skill }, { data: activated }] = await Promise.all([
    supabase.from("skills").select(SKILL_SELECT).eq("id", id).maybeSingle(),
    supabase
      .from("skill_versions")
      .select(SKILL_VERSION_SELECT)
      .eq("id", vid)
      .maybeSingle(),
  ])

  return NextResponse.json({ skill, version: activated })
}
