import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import {
  createDdQuestionSchema,
  DD_QUESTION_SELECT,
  DD_QUESTION_STATUSES,
} from "./_schema"

// PROJ-113 — DD Q&A questions under a project's DD streams.
//
// GET  /api/projects/[id]/dd-questions?streamId=&status=&ownerId=  — list (project
//      members; RLS-scoped, need-to-know gate hides questions above clearance).
// POST /api/projects/[id]/dd-questions  — create (edit: admin/lead/editor). The
//      confidentiality FLOOR trigger clamps the level up to the parent stream.

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

  const url = new URL(request.url)
  const streamId = url.searchParams.get("streamId")
  const status = url.searchParams.get("status")
  const ownerId = url.searchParams.get("ownerId")

  if (streamId && !z.string().uuid().safeParse(streamId).success) {
    return apiError("validation_error", "Invalid streamId.", 400, "streamId")
  }
  if (
    status &&
    !DD_QUESTION_STATUSES.includes(status as (typeof DD_QUESTION_STATUSES)[number])
  ) {
    return apiError("validation_error", "Invalid status filter.", 400, "status")
  }
  if (ownerId && !z.string().uuid().safeParse(ownerId).success) {
    return apiError("validation_error", "Invalid ownerId.", 400, "ownerId")
  }

  let query = supabase
    .from("dd_questions")
    .select(DD_QUESTION_SELECT)
    .eq("project_id", projectId)
  if (streamId) query = query.eq("dd_stream_id", streamId)
  if (status) query = query.eq("status", status)
  if (ownerId) query = query.eq("responsible_user_id", ownerId)

  const { data, error } = await query
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1000)
  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ questions: data ?? [] })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
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
  const parsed = createDdQuestionSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { data, error } = await supabase
    .from("dd_questions")
    .insert({
      tenant_id: access.project.tenant_id,
      project_id: projectId,
      dd_stream_id: parsed.data.dd_stream_id,
      title: parsed.data.title,
      detail: parsed.data.detail ?? null,
      addressee: parsed.data.addressee ?? null,
      priority: parsed.data.priority ?? "medium",
      due_date: parsed.data.due_date ?? null,
      responsible_user_id: parsed.data.responsible_user_id ?? null,
      confidentiality_level: parsed.data.confidentiality_level ?? "standard",
      created_by: userId,
    })
    .select(DD_QUESTION_SELECT)
    .single()

  if (error) {
    // floor trigger tenant/project mismatch (23514) or unknown stream/user (23503)
    if (error.code === "23514") {
      return apiError("validation_error", "Stream does not belong to this project.", 400, "dd_stream_id")
    }
    if (error.code === "23503") {
      return apiError("validation_error", "Unknown stream or user.", 400)
    }
    if (error.code === "42501") {
      return apiError("forbidden", "Not cleared for this confidentiality level.", 403)
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ question: data }, { status: 201 })
}