import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"

// PROJ-8 — soft-deactivate a stakeholder. Sets `is_active = false` so the
// row stays in the audit history (when PROJ-10 lands) but is hidden from
// default lists. Reactivation is a separate POST endpoint.

interface Ctx {
  params: Promise<{ id: string; sid: string }>
}

export async function POST(_request: Request, ctx: Ctx) {
  const { id: projectId, sid } = await ctx.params
  if (!z.string().uuid().safeParse(sid).success) {
    return apiError("validation_error", "Invalid stakeholder id.", 400, "sid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("stakeholders")
    .update({ is_active: false })
    .eq("project_id", projectId)
    .eq("id", sid)
    .select("id, is_active")
    .single()

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") {
      return apiError("not_found", "Stakeholder not found.", 404)
    }
    return apiError("update_failed", error.message, 500)
  }
  return NextResponse.json({ stakeholder: data })
}
