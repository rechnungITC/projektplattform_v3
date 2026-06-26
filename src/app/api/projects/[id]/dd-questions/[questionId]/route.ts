import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { DD_QUESTION_SELECT, updateDdQuestionSchema } from "../_schema"

// PROJ-113 — single DD question management (edit: admin/lead/editor).
//
// PATCH  /api/projects/[id]/dd-questions/[questionId]  — edit fields and/or set
//        an answer. Status is NOT editable here (goes through .../status). When
//        an answer is (re)set, answered_at/answered_by are stamped; answer_round
//        increments if the question already carried a prior answer (re-answer).
// DELETE /api/projects/[id]/dd-questions/[questionId]

export async function PATCH(
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
  const parsed = updateDdQuestionSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }
  const d = parsed.data

  const patch: Record<string, unknown> = {}
  if (d.title !== undefined) patch.title = d.title
  if (d.detail !== undefined) patch.detail = d.detail
  if (d.addressee !== undefined) patch.addressee = d.addressee
  if (d.priority !== undefined) patch.priority = d.priority
  if (d.due_date !== undefined) patch.due_date = d.due_date
  if (d.responsible_user_id !== undefined)
    patch.responsible_user_id = d.responsible_user_id
  if (d.confidentiality_level !== undefined)
    patch.confidentiality_level = d.confidentiality_level

  // Answer handling: stamp answered_at/by; bump answer_round on a re-answer.
  const settingAnswer = d.answer_text !== undefined || d.answer_link !== undefined
  if (d.answer_text !== undefined) patch.answer_text = d.answer_text
  if (d.answer_link !== undefined) patch.answer_link = d.answer_link
  if (settingAnswer && (d.answer_text || d.answer_link)) {
    patch.answered_at = new Date().toISOString()
    patch.answered_by = userId
    // increment round only if a prior answer existed (RLS-scoped read)
    const { data: current } = await supabase
      .from("dd_questions")
      .select("answered_at, answer_round")
      .eq("id", questionId)
      .eq("project_id", projectId)
      .maybeSingle()
    if (current?.answered_at) {
      patch.answer_round = (current.answer_round ?? 1) + 1
    }
  }

  const { data, error } = await supabase
    .from("dd_questions")
    .update(patch)
    .eq("id", questionId)
    .eq("project_id", projectId)
    .select(DD_QUESTION_SELECT)
    .maybeSingle()

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Not cleared for this confidentiality level.", 403)
    }
    return apiError("update_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Question not found.", 404)

  return NextResponse.json({ question: data })
}

export async function DELETE(
  _request: Request,
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

  const { error } = await supabase
    .from("dd_questions")
    .delete()
    .eq("id", questionId)
    .eq("project_id", projectId)

  if (error) return apiError("delete_failed", error.message, 500)
  return NextResponse.json({ ok: true })
}
