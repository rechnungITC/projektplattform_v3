import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import {
  isScheduleConstructAllowedInMethod,
  scheduleConstructRejectionMessage,
} from "@/lib/work-items/schedule-method-visibility"
import type { ProjectMethod } from "@/types/project-method"

import {
  normalizePhasePayload,
  phaseCreateSchema as createSchema,
} from "./_schema"

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  let body: unknown
  try { body = await request.json() } catch { return apiError("invalid_body", "Body must be JSON.", 400) }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    const f = parsed.error.issues[0]
    return apiError("validation_error", f?.message ?? "Invalid body.", 400, f?.path?.[0]?.toString())
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // Resolve project tenant_id + method (RLS will block if user can't read it)
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("tenant_id, project_method")
    .eq("id", projectId)
    .maybeSingle()
  if (projErr) return apiError("internal_error", projErr.message, 500)
  if (!project) return apiError("not_found", "Project not found.", 404)

  // PROJ-26: method-gating — phases only in waterfall/pmi/prince2/vxt2 (or NULL/setup).
  const projectMethod = project.project_method as ProjectMethod | null
  if (!isScheduleConstructAllowedInMethod("phases", projectMethod)) {
    return apiError(
      "schedule_construct_not_allowed_in_method",
      scheduleConstructRejectionMessage("phases", projectMethod as ProjectMethod),
      422,
      "project_method"
    )
  }

  // Auto sequence_number if not provided: max + 1
  let seq = parsed.data.sequence_number
  if (seq === undefined) {
    const { data: maxRow } = await supabase
      .from("phases")
      .select("sequence_number")
      .eq("project_id", projectId)
      .eq("is_deleted", false)
      .order("sequence_number", { ascending: false })
      .limit(1)
      .maybeSingle()
    seq = (maxRow?.sequence_number ?? 0) + 1
  }

  // Spread-Pattern: schema is the single source of truth. Server-set fields
  // (sequence_number resolution, tenant_id, created_by) override schema input.
  const insertPayload = {
    ...normalizePhasePayload(parsed.data),
    tenant_id: project.tenant_id,
    project_id: projectId,
    sequence_number: seq,
    created_by: userId,
  }

  const { data: row, error } = await supabase
    .from("phases")
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    if (error.code === "23505") return apiError("duplicate_sequence", "sequence_number is already used in this project.", 422, "sequence_number")
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ phase: row }, { status: 201 })
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data, error } = await supabase
    .from("phases")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_deleted", false)
    .order("sequence_number", { ascending: true })

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ phases: data ?? [] })
}
