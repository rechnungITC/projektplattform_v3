/**
 * PROJ-65 ε.3e (F-62) — DELETE /api/projects/[id]/risk-links/[lid]
 *
 * Removes a risk ↔ phase/sprint link. RLS gates the delete to project
 * editor/lead/tenant-admin; the ε.3e DELETE audit trigger records a `__row__`
 * snapshot. Project scope is verified via an inner join before the delete.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

interface Ctx {
  params: Promise<{ id: string; lid: string }>
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id: projectId, lid } = await ctx.params

  if (!z.string().uuid().safeParse(lid).success) {
    return apiError("validation_error", "lid must be a UUID.", 400, "lid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  // Verify the link exists and belongs to this project (via the risk join).
  const { data: existing, error: lookupErr } = await supabase
    .from("risk_links")
    .select("id, risks!inner(project_id)")
    .eq("id", lid)
    .eq("risks.project_id", projectId)
    .maybeSingle()
  if (lookupErr) return apiError("read_failed", lookupErr.message, 500)
  if (!existing) return apiError("not_found", "Risk link not found in this project.", 404)

  const { error } = await supabase.from("risk_links").delete().eq("id", lid)
  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Not allowed to delete risk links.", 403)
    }
    return apiError("delete_failed", error.message, 500)
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
