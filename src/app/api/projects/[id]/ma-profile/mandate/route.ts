import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { transitionMandateSchema } from "../_schema"

// PROJ-94 (AC-4) — transition the mandate status of an M&A project.
// POST /api/projects/[id]/ma-profile/mandate  { to_status }
//
// The transition_mandate_status RPC owns the state machine
// (draft → submitted → approved, terminal) and authority (tenant-admin /
// project-lead / sponsor / deal-lead) and is audited via the AFTER UPDATE
// trigger. The route only verifies project visibility; the RPC owns the final
// role + need-to-know decision.
// 'approved' is the gate PROJ-95 consumes to unlock Phase 2 (Target-Screening).

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = transitionMandateSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase.rpc("transition_mandate_status", {
    p_project_id: projectId,
    p_to_status: parsed.data.to_status,
  })

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Only the deal lead, sponsor, project lead or a tenant admin can change the mandate status.",
        403
      )
    }
    if (error.code === "P0002") {
      return apiError("not_found", "M&A project profile not found.", 404)
    }
    if (error.code === "23514") {
      return apiError("invalid_transition", error.message, 422)
    }
    return apiError("transition_failed", error.message, 500)
  }

  return NextResponse.json({ mandate: data })
}
