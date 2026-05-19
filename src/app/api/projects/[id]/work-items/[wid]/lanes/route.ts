/**
 * PROJ-65 ε.1 — Read-only Compliance-Lane listing per Work-Item.
 *
 *   GET /api/projects/[id]/work-items/[wid]/lanes
 *     → { lanes: ComplianceLane[] }
 *
 * L7-Lock: this endpoint is read-only for ε.1. Lane rows are auto-managed
 * by the `work_item_tags_sync_lane` trigger from work_item_tags. Direct
 * user-edit (POST/DELETE) lands in a later slice when manual lanes are
 * needed (source_kind='manual').
 */

import type { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
  type ApiErrorBody,
} from "../../../../../_lib/route-helpers"

interface Ctx {
  params: Promise<{ id: string; wid: string }>
}

const UuidSchema = z.string().uuid()

export async function GET(
  _request: Request,
  ctx: Ctx,
): Promise<Response | NextResponse<ApiErrorBody>> {
  const { id: projectId, wid } = await ctx.params
  if (!UuidSchema.safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!UuidSchema.safeParse(wid).success) {
    return apiError("validation_error", "Invalid work-item id.", 400, "wid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  // RLS narrows by membership; we still scope to (project, work_item) to
  // avoid leaking lane keys from unrelated work-items if the caller
  // crafts a bogus wid that they happen to be a member of.
  const wiRes = await supabase
    .from("work_items")
    .select("id")
    .eq("id", wid)
    .eq("project_id", projectId)
    .maybeSingle()
  if (wiRes.error) {
    return apiError("internal_error", wiRes.error.message, 500)
  }
  if (!wiRes.data) {
    return apiError("not_found", "Work item not found.", 404)
  }

  const lanesRes = await supabase
    .from("work_item_compliance_lanes")
    .select("id, work_item_id, lane_key, display_label, source_kind, created_at")
    .eq("work_item_id", wid)
    .order("lane_key", { ascending: true })
  if (lanesRes.error) {
    return apiError("internal_error", lanesRes.error.message, 500)
  }
  return Response.json({ lanes: lanesRes.data ?? [] })
}
