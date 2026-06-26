import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { transitionDdQuestionSchema } from "../../_schema"

// PROJ-113 — DD question status transition.
//
// POST /api/projects/[id]/dd-questions/[questionId]/status  { to_status, comment? }
//
// transition_dd_question_status enforces edit-role AND need-to-know clearance
// (the RPC re-checks can_access_classified since it bypasses RLS) + the 5-state
// machine. We map 42501 -> 403, 23514/22023 -> 400, P0002 -> 404.

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; questionId: string }> }
) {
  const { id: projectId, questionId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(questionId).success) {
    return apiError("validation_error", "Invalid question id.", 400, "questionId")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = transitionDdQuestionSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { data, error } = await supabase.rpc("transition_dd_question_status", {
    p_question_id: questionId,
    p_to_status: parsed.data.to_status,
    p_comment: parsed.data.comment ?? null,
  })

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Not authorized to change this question.", 403)
    }
    if (error.code === "P0002") {
      return apiError("not_found", "Question not found.", 404)
    }
    if (error.code === "23514" || error.code === "22023") {
      return apiError("validation_error", error.message, 400, "to_status")
    }
    return apiError("transition_failed", error.message, 500)
  }

  return NextResponse.json({ question: data })
}
