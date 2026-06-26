import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-95 (AC-95-1) — seed the M&A standard phase model into the existing
// phases table.
//
// POST /api/projects/[id]/phase-model/activate
//
// Idempotent: re-running only adds phases that don't exist yet. Phase 2
// ("Target-Screening") is mandate-gated and only seeded once the project's
// ma_project_profiles.mandate_status='approved' (PROJ-94 gate). The
// activate_ma_phase_model RPC owns the M&A-type check, the caller authority
// (tenant-admin / project-lead) and the mandate gate; the route only verifies
// project visibility. The generic phase state-machine (transition_phase_status)
// is untouched — the mandate gate lives entirely in the M&A-specific RPC.
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase.rpc("activate_ma_phase_model", {
    p_project_id: projectId,
  })

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Only a project lead or tenant admin can activate the M&A phase model.",
        403
      )
    }
    if (error.code === "02000") {
      return apiError("not_found", "Project not found.", 404)
    }
    if (error.code === "22023") {
      return apiError(
        "not_ma_project",
        "The phase model is only available for M&A projects.",
        422
      )
    }
    return apiError("activate_failed", error.message, 500)
  }

  return NextResponse.json(data)
}