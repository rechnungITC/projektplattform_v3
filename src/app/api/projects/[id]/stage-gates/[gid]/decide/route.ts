import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { decideStageGateSchema } from "../../_schema"

// PROJ-110 — decide a stage gate (Freigabe / Auflage / Abbruch). The RPC is
// atomic: writes a neutral PROJ-20 decision (the immutable log entry), stores
// the confidential reason/conditions on the gate, then activates the next
// phase (Freigabe/Auflage) or cancels the project (Abbruch). Authority +
// clearance + pending-guard live in the SECURITY DEFINER RPC.
// POST /api/projects/[id]/stage-gates/[gid]/decide

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; gid: string }> }
) {
  const { id: projectId, gid } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(gid).success) {
    return apiError("validation_error", "Invalid gate id.", 400, "gid")
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = decideStageGateSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { decision, reason, conditions, confidentiality_level } = parsed.data
  if (decision === "abbruch" && !reason?.trim()) {
    return apiError(
      "validation_error",
      "Abort requires a reason (Begründung).",
      400,
      "reason"
    )
  }

  const { data, error } = await supabase.rpc("decide_stage_gate", {
    p_gate_id: gid,
    p_decision: decision,
    p_reason: reason ?? null,
    p_conditions: conditions ?? null,
    p_confidentiality_level: confidentiality_level ?? null,
  })

  if (error) {
    if (error.code === "42501")
      return apiError(
        "forbidden",
        "Lead role and sufficient clearance required to decide this gate.",
        403
      )
    if (error.code === "02000")
      return apiError("not_found", "Stage gate not found.", 404)
    if (error.code === "23514")
      return apiError("conflict", error.message, 409)
    if (error.code === "22023")
      return apiError("validation_error", error.message, 400)
    return apiError("decide_failed", error.message, 500)
  }
  return NextResponse.json({ result: data })
}
