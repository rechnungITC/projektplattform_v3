import { NextResponse } from "next/server"

import { listConnectors } from "@/lib/connectors/registry"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../_lib/route-helpers"

// PROJ-14 — connector registry list (admin-only).
// GET /api/connectors → snapshot of every known connector + health.

export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  const tenantId = membership?.tenant_id as string | undefined
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const adminDenial = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminDenial) return adminDenial

  try {
    const entries = await listConnectors(supabase, tenantId)
    return NextResponse.json({ connectors: entries })
  } catch (err) {
    return apiError(
      "list_failed",
      err instanceof Error ? err.message : "Unbekannter Fehler",
      500
    )
  }
}
