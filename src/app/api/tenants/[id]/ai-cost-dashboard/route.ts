/**
 * PROJ-32-d — Tenant AI Cost Dashboard data
 *
 *   GET /api/tenants/[id]/ai-cost-dashboard
 *
 * Returns the current cap config + current-month per-provider usage +
 * 6-month trend (per-month aggregate). Admin-only.
 */

import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../_lib/route-helpers"
import { getCostDashboardData } from "@/lib/ai/cost-cap"

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id: tenantId } = await ctx.params

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const denied = await requireTenantAdmin(supabase, tenantId, userId)
  if (denied) return denied

  try {
    const data = await getCostDashboardData({ supabase, tenantId })
    return NextResponse.json(data)
  } catch (err) {
    return apiError(
      "dashboard_failed",
      err instanceof Error ? err.message : String(err),
      500,
    )
  }
}
