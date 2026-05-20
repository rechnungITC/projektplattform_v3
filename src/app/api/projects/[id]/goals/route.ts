/**
 * PROJ-65 ε.1 — Project Goals collection.
 *
 *   GET  /api/projects/[id]/goals
 *     query: include_deleted? (admin-only audit-recovery), parent_goal_id?
 *     → { goals: ProjectGoal[] }
 *
 *   POST /api/projects/[id]/goals
 *     body: { title, description?, success_criteria?, target_date?,
 *             status?, parent_goal_id?, source_phase_id?,
 *             source_milestone_id?, sort_order? }
 *     → { goal: ProjectGoal }
 *
 * RLS gates project membership; `is_project_member(project_id)` enforced
 * on the table. Source-Refs (L6) accept nullable FK to phases/milestones;
 * server validates they belong to the same project to prevent cross-
 * project Source-attribution.
 */

import type { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
  type ApiErrorBody,
} from "../../../_lib/route-helpers"

interface Ctx {
  params: Promise<{ id: string }>
}

const UuidSchema = z.string().uuid()

const GOAL_COLUMNS =
  "id, tenant_id, project_id, title, description, success_criteria, target_date, status, parent_goal_id, source_phase_id, source_milestone_id, sort_order, created_by, created_at, updated_at"

const CreateGoalSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  success_criteria: z.string().max(2000).optional().nullable(),
  target_date: z.string().date().optional().nullable(),
  status: z.enum(["draft", "active", "achieved", "abandoned"]).optional(),
  parent_goal_id: UuidSchema.optional().nullable(),
  source_phase_id: UuidSchema.optional().nullable(),
  source_milestone_id: UuidSchema.optional().nullable(),
  sort_order: z.number().int().min(0).max(10000).optional(),
})

export async function GET(
  request: Request,
  ctx: Ctx,
): Promise<Response | NextResponse<ApiErrorBody>> {
  const { id: projectId } = await ctx.params
  if (!UuidSchema.safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const url = new URL(request.url)
  const parentFilter = url.searchParams.get("parent_goal_id")

  let query = supabase
    .from("project_goals")
    .select(GOAL_COLUMNS)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500)

  if (parentFilter === "null" || parentFilter === "") {
    query = query.is("parent_goal_id", null)
  } else if (parentFilter && UuidSchema.safeParse(parentFilter).success) {
    query = query.eq("parent_goal_id", parentFilter)
  }

  const res = await query
  if (res.error) {
    return apiError("internal_error", res.error.message, 500)
  }
  return Response.json({ goals: res.data ?? [] })
}

export async function POST(
  request: Request,
  ctx: Ctx,
): Promise<Response | NextResponse<ApiErrorBody>> {
  const { id: projectId } = await ctx.params
  if (!UuidSchema.safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error
  const tenantId = (access.project as { tenant_id: string }).tenant_id

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = CreateGoalSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return apiError(
      "validation_error",
      issue?.message ?? "Validation failed.",
      400,
      issue?.path?.join(".") ?? undefined,
    )
  }
  const input = parsed.data

  // Same-project guard on optional source-refs + parent.
  if (input.source_phase_id) {
    const r = await supabase
      .from("phases")
      .select("id")
      .eq("id", input.source_phase_id)
      .eq("project_id", projectId)
      .maybeSingle()
    if (r.error) return apiError("internal_error", r.error.message, 500)
    if (!r.data)
      return apiError(
        "validation_error",
        "Source phase must belong to the same project.",
        400,
        "source_phase_id",
      )
  }
  if (input.source_milestone_id) {
    const r = await supabase
      .from("milestones")
      .select("id")
      .eq("id", input.source_milestone_id)
      .eq("project_id", projectId)
      .maybeSingle()
    if (r.error) return apiError("internal_error", r.error.message, 500)
    if (!r.data)
      return apiError(
        "validation_error",
        "Source milestone must belong to the same project.",
        400,
        "source_milestone_id",
      )
  }
  if (input.parent_goal_id) {
    const r = await supabase
      .from("project_goals")
      .select("id")
      .eq("id", input.parent_goal_id)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle()
    if (r.error) return apiError("internal_error", r.error.message, 500)
    if (!r.data)
      return apiError(
        "validation_error",
        "Parent goal must belong to the same project.",
        400,
        "parent_goal_id",
      )
  }

  const insertRes = await supabase
    .from("project_goals")
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      title: input.title,
      description: input.description ?? null,
      success_criteria: input.success_criteria ?? null,
      target_date: input.target_date ?? null,
      status: input.status ?? "draft",
      parent_goal_id: input.parent_goal_id ?? null,
      source_phase_id: input.source_phase_id ?? null,
      source_milestone_id: input.source_milestone_id ?? null,
      sort_order: input.sort_order ?? 0,
      created_by: userId,
    })
    .select(GOAL_COLUMNS)
    .single()
  if (insertRes.error) {
    return apiError("internal_error", insertRes.error.message, 500)
  }
  return Response.json({ goal: insertRes.data }, { status: 201 })
}
