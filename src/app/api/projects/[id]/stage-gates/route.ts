import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { STAGE_GATE_COLUMNS } from "./_schema"

// PROJ-110 — Stage-Gate collection endpoint.
// GET /api/projects/[id]/stage-gates — list the project's gates (RLS-scoped;
// confidential gates the caller can't access are hidden by the RESTRICTIVE
// need-to-know policy). Seeding is a separate POST /stage-gates/seed; deciding
// is POST /stage-gates/[gid]/decide.

export async function GET(
  request: Request,
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

  const { data, error } = await supabase
    .from("ma_stage_gates")
    .select(STAGE_GATE_COLUMNS)
    .eq("project_id", projectId)
    .order("sequence_number", { ascending: true })
    .limit(100)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ stage_gates: data ?? [] })
}
