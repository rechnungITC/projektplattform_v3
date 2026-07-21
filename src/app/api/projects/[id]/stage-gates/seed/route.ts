import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-110 — lazy-seed the 9-gate preset for an M&A project (mirror of the
// PROJ-95 phase-model activation). Idempotent; manager-gated. Delegates all
// authority + M&A-type checks to the SECURITY DEFINER RPC.
// POST /api/projects/[id]/stage-gates/seed

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

  const access = await requireProjectAccess(
    supabase,
    projectId,
    userId,
    "manage_members"
  )
  if (access.error) return access.error

  const { data, error } = await supabase.rpc("seed_stage_gates", {
    p_project_id: projectId,
  })

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    if (error.code === "02000")
      return apiError("not_found", "Project not found.", 404)
    if (error.code === "22023")
      return apiError("invalid_project_type", error.message, 422)
    return apiError("seed_failed", error.message, 500)
  }
  return NextResponse.json({ result: data })
}
