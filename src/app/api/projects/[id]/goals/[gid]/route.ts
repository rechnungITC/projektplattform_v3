/**
 * PROJ-65 ε.1 — Project Goal single-row endpoint.
 *
 *   PATCH  /api/projects/[id]/goals/[gid]
 *     body: Partial of CreateGoalSchema fields
 *     → { goal: ProjectGoal }
 *
 *   DELETE /api/projects/[id]/goals/[gid]
 *     → 204; soft-delete via deleted_at; children get parent_goal_id
 *       SET NULL via FK so they don't disappear.
 *
 * L6 lifecycle: source_phase_id / source_milestone_id are nullable;
 * when their source row is deleted upstream, FK SET NULL leaves the goal
 * intact but detached. UI renders a Detached-Badge.
 */

import type { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
  type ApiErrorBody,
} from "../../../../_lib/route-helpers"

interface Ctx {
  params: Promise<{ id: string; gid: string }>
}

const UuidSchema = z.string().uuid()

const GOAL_COLUMNS =
  "id, tenant_id, project_id, title, description, success_criteria, target_date, status, parent_goal_id, source_phase_id, source_milestone_id, sort_order, created_by, created_at, updated_at"

const PatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  success_criteria: z.string().max(2000).optional().nullable(),
  target_date: z.string().date().optional().nullable(),
  status: z.enum(["draft", "active", "achieved", "abandoned"]).optional(),
  parent_goal_id: UuidSchema.optional().nullable(),
  source_phase_id: UuidSchema.optional().nullable(),
  source_milestone_id: UuidSchema.optional().nullable(),
  sort_order: z.number().int().min(0).max(10000).optional(),
})

export async function PATCH(
  request: Request,
  ctx: Ctx,
): Promise<Response | NextResponse<ApiErrorBody>> {
  const { id: projectId, gid } = await ctx.params
  if (!UuidSchema.safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!UuidSchema.safeParse(gid).success) {
    return apiError("validation_error", "Invalid goal id.", 400, "gid")
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
  const parsed = PatchSchema.safeParse(body)
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

  // Same-project guards on optional refs.
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
    if (input.parent_goal_id === gid) {
      return apiError(
        "validation_error",
        "A goal cannot be its own parent.",
        400,
        "parent_goal_id",
      )
    }
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

  const update: Record<string, unknown> = {}
  if (input.title !== undefined) update.title = input.title
  if (input.description !== undefined) update.description = input.description
  if (input.success_criteria !== undefined)
    update.success_criteria = input.success_criteria
  if (input.target_date !== undefined) update.target_date = input.target_date
  if (input.status !== undefined) update.status = input.status
  if (input.parent_goal_id !== undefined)
    update.parent_goal_id = input.parent_goal_id
  if (input.source_phase_id !== undefined)
    update.source_phase_id = input.source_phase_id
  if (input.source_milestone_id !== undefined)
    update.source_milestone_id = input.source_milestone_id
  if (input.sort_order !== undefined) update.sort_order = input.sort_order
  if (Object.keys(update).length === 0) {
    return apiError("validation_error", "No updatable fields provided.", 400)
  }

  const updateRes = await supabase
    .from("project_goals")
    .update(update)
    .eq("id", gid)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .select(GOAL_COLUMNS)
    .maybeSingle()
  if (updateRes.error) {
    return apiError("internal_error", updateRes.error.message, 500)
  }
  if (!updateRes.data) {
    return apiError("not_found", "Goal not found.", 404)
  }
  return Response.json({ goal: updateRes.data })
}

export async function DELETE(
  _request: Request,
  ctx: Ctx,
): Promise<Response | NextResponse<ApiErrorBody>> {
  const { id: projectId, gid } = await ctx.params
  if (!UuidSchema.safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!UuidSchema.safeParse(gid).success) {
    return apiError("validation_error", "Invalid goal id.", 400, "gid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  // Soft-delete only; children keep parent_goal_id = NULL via FK on delete.
  const delRes = await supabase
    .from("project_goals")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", gid)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle()
  if (delRes.error) {
    return apiError("internal_error", delRes.error.message, 500)
  }
  if (!delRes.data) {
    return apiError("not_found", "Goal not found.", 404)
  }
  return new Response(null, { status: 204 })
}
