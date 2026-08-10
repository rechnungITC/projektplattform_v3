import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { transitionSpaIssueSchema } from "../../_schema"

// PROJ-122 — POST /api/projects/[id]/spa-issues/[issueId]/status
// Single audited status path via transition_spa_issue_status (house norm).
// Every target state is reachable on purpose: contract negotiation is
// non-linear, an "agreed" point can reopen in a later round.

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; issueId: string }> }
) {
  const { id: projectId, issueId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(issueId).success) {
    return apiError("validation_error", "Invalid issue id.", 400, "issueId")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = transitionSpaIssueSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { data, error } = await supabase.rpc("transition_spa_issue_status", {
    p_issue_id: issueId,
    p_status: parsed.data.status,
  })

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Not authorized to change this status.", 403)
    }
    if (error.code === "P0002") {
      return apiError("not_found", "SPA issue not found.", 404)
    }
    if (error.code?.startsWith("23") || error.code === "22023") {
      return apiError("validation_error", error.message, 400)
    }
    return apiError("transition_failed", error.message, 500)
  }

  return NextResponse.json({ issue: data })
}
