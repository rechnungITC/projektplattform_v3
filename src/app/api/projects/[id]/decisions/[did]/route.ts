import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

// PROJ-20 — single-decision read endpoint.
// GET /api/projects/[id]/decisions/[did]
//
// No PATCH/DELETE: decisions are append-only. Revisions are POSTed against
// the collection endpoint with `supersedes_decision_id`.

interface Ctx {
  params: Promise<{ id: string; did: string }>
}

const SELECT_COLUMNS =
  "id, tenant_id, project_id, title, decision_text, rationale, decided_at, decider_stakeholder_id, context_phase_id, context_risk_id, supersedes_decision_id, is_revised, created_by, created_at"

export async function GET(_request: Request, ctx: Ctx) {
  const { id: projectId, did } = await ctx.params
  if (!z.string().uuid().safeParse(did).success) {
    return apiError("validation_error", "Invalid decision id.", 400, "did")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "decisions",
    { intent: "read" }
  )
  if (moduleDenial) return moduleDenial

  const { data, error } = await supabase
    .from("decisions")
    .select(SELECT_COLUMNS)
    .eq("project_id", projectId)
    .eq("id", did)
    .maybeSingle()

  if (error) {
    return apiError("read_failed", error.message, 500)
  }
  if (!data) {
    return apiError("not_found", "Decision not found.", 404)
  }
  return NextResponse.json({ decision: data })
}
