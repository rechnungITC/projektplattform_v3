/**
 * PROJ-25 Stage 4 — GET /api/projects/[id]/critical-path
 *
 * Returns the phase IDs on the longest FS-cumulative-duration chain.
 * Pure read, no side effects. RLS still gates access (the helper RPC is
 * SECURITY DEFINER but only the caller's tenant rows reach it via the
 * subsequent project-membership check below).
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase.rpc("compute_critical_path_phases", {
    p_project_id: projectId,
  })
  if (error) return apiError("internal_error", error.message, 500)

  // Function returns a uuid[] (PostgREST surfaces it as a string[]).
  const phaseIds = Array.isArray(data) ? (data as string[]) : []
  return NextResponse.json({ phase_ids: phaseIds })
}
