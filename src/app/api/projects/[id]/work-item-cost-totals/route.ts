/**
 * PROJ-24 ST-08 — per-item cost totals for the backlog list.
 *
 * GET /api/projects/[id]/work-item-cost-totals
 *   → { totals: WorkItemCostTotal[] }
 *
 * Reads the `work_item_cost_totals` view (security_invoker = true) which
 * returns one aggregated row per (work_item_id, currency). Soft-deleted
 * work-items are filtered out by the view.
 *
 * Auth: project-member via RLS. We resolve the project up-front for a
 * clean 404 on cross-project / cross-tenant access (no existence-leak via
 * empty arrays).
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("work_item_cost_totals")
    .select(
      "work_item_id, total_cost, currency, cost_lines_count, multi_currency_count, is_estimated"
    )
    .eq("project_id", projectId)
    .limit(2000)

  if (error) return apiError("list_failed", error.message, 500)

  return NextResponse.json({ totals: data ?? [] })
}
