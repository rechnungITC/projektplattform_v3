import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import {
  isScheduleConstructAllowedInMethod,
  scheduleConstructRejectionMessage,
} from "@/lib/work-items/schedule-method-visibility"
import type { ProjectMethod } from "@/types/project-method"

import {
  normalizeSprintPayload,
  sprintCreateSchema as createSchema,
} from "./_schema"

// -----------------------------------------------------------------------------
// POST /api/projects/[id]/sprints  --  create
// -----------------------------------------------------------------------------
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
    return apiError("invalid_body", "Body must be JSON.", 400)
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    const f = parsed.error.issues[0]
    return apiError(
      "validation_error",
      f?.message ?? "Invalid body.",
      400,
      f?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("tenant_id, project_method")
    .eq("id", projectId)
    .maybeSingle()
  if (projErr) return apiError("internal_error", projErr.message, 500)
  if (!project) return apiError("not_found", "Project not found.", 404)

  // PROJ-26: method-gating — sprints only in scrum/safe (or NULL/setup).
  const projectMethod = project.project_method as ProjectMethod | null
  if (!isScheduleConstructAllowedInMethod("sprints", projectMethod)) {
    return apiError(
      "schedule_construct_not_allowed_in_method",
      scheduleConstructRejectionMessage("sprints", projectMethod as ProjectMethod),
      422,
      "project_method"
    )
  }

  // Spread-Pattern: schema is the single source of truth.
  const insertPayload = {
    ...normalizeSprintPayload(parsed.data),
    tenant_id: project.tenant_id,
    project_id: projectId,
    created_by: userId,
  }

  const { data: row, error } = await supabase
    .from("sprints")
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("create_failed", error.message, 500)
  }
  return NextResponse.json({ sprint: row }, { status: 201 })
}

// -----------------------------------------------------------------------------
// GET /api/projects/[id]/sprints  --  list
// -----------------------------------------------------------------------------
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

  const url = new URL(request.url)
  const stateParam = url.searchParams.get("state")

  let query = supabase
    .from("sprints")
    .select("*")
    .eq("project_id", projectId)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })

  if (stateParam) {
    if (!["planned", "active", "closed"].includes(stateParam)) {
      return apiError("validation_error", "Invalid state.", 400, "state")
    }
    query = query.eq("state", stateParam)
  }

  const { data, error } = await query
  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ sprints: data ?? [] })
}
