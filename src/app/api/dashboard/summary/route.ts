/**
 * PROJ-64 — GET /api/dashboard/summary
 *
 * Single tenant-scoped aggregation endpoint that powers the
 * authenticated dashboard at `/`. Returns the user's My Work,
 * pending approvals, project-health exceptions, alerts, recent
 * reports, KPIs and capabilities in one pass.
 *
 * Errors at the section level surface as `{ state: 'error',
 * data: null, error: string }` envelopes — the route only returns
 * 5xx for whole-payload failures (auth, tenant resolution).
 */

import { NextResponse } from "next/server"

import { resolveActiveTenantId } from "@/app/api/_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
} from "@/app/api/_lib/route-helpers"
import { resolveDashboardSummary } from "@/lib/dashboard/summary"

export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) {
    return apiError(
      "no_active_tenant",
      "No active tenant for this user.",
      404,
    )
  }

  // Read tenant role for the capability flags. We do NOT short-
  // circuit on missing membership — the previous resolveActiveTenantId
  // returned tenantId only when a membership exists.
  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle<{ role: string }>()

  const isTenantAdmin = membership?.role === "admin"

  const summary = await resolveDashboardSummary({
    supabase,
    userId,
    tenantId,
    isTenantAdmin,
  })

  return NextResponse.json({ summary })
}
