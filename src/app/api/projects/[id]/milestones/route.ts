import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import {
  isScheduleConstructAllowedInMethod,
  scheduleConstructRejectionMessage,
} from "@/lib/work-items/schedule-method-visibility"
import type { ProjectMethod } from "@/types/project-method"

import {
  milestoneCreateSchema as createSchema,
  normalizeMilestonePayload,
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

  const { data: project, error: projErr } = await supabase
    .from("projects").select("tenant_id, project_method").eq("id", projectId).maybeSingle()
  if (projErr) return apiError("internal_error", projErr.message, 500)
  if (!project) return apiError("not_found", "Project not found.", 404)

  // PROJ-26: method-gating — milestones only in waterfall/pmi/prince2/vxt2 (or NULL/setup).
  const projectMethod = project.project_method as ProjectMethod | null
  if (!isScheduleConstructAllowedInMethod("milestones", projectMethod)) {
    return apiError(
      "schedule_construct_not_allowed_in_method",
      scheduleConstructRejectionMessage("milestones", projectMethod as ProjectMethod),
      422,
      "project_method"
    )
  }

  // Spread-Pattern: schema is the single source of truth. Drift-test in
  // route.test.ts asserts every schema key reaches this payload.
  const insertPayload = {
    ...normalizeMilestonePayload(parsed.data),
    tenant_id: project.tenant_id,
    project_id: projectId,
    created_by: userId,
  }

  const { data, error } = await supabase
    .from("milestones").insert(insertPayload).select().single()

  if (error) {
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ milestone: data }, { status: 201 })
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const url = new URL(request.url)
  const phaseFilter = url.searchParams.get("phase_id")
  const statusFilter = url.searchParams.get("status")
  const overdueOnly = url.searchParams.get("overdue") === "true"

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  let query = supabase
    .from("milestones").select("*").eq("project_id", projectId).eq("is_deleted", false)
    .order("target_date", { ascending: true })

  if (phaseFilter && phaseFilter !== "__none__") query = query.eq("phase_id", phaseFilter)
  if (phaseFilter === "__none__") query = query.is("phase_id", null)
  if (statusFilter) query = query.eq("status", statusFilter)
  if (overdueOnly) {
    const today = new Date().toISOString().slice(0, 10)
    query = query.eq("status", "planned").lt("target_date", today)
  }

  const { data, error } = await query
  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ milestones: data ?? [] })
}
