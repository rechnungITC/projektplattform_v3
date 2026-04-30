/**
 * PROJ-16 — shared helper: resolve the caller's active tenant + verify
 * tenant_admin in one call. Reused across all master-data routes.
 */

import type { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "@/app/api/_lib/route-helpers"

type Supabase = Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"]

export async function adminTenantContext(): Promise<
  | { tenantId: string; userId: string; supabase: Supabase }
  | { error: NextResponse }
> {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return { error: apiError("unauthorized", "Not signed in.", 401) }

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  const tenantId = membership?.tenant_id as string | undefined
  if (!tenantId) {
    return { error: apiError("forbidden", "No tenant membership.", 403) }
  }

  const adminDenial = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminDenial) return { error: adminDenial }

  return { tenantId, userId, supabase }
}
