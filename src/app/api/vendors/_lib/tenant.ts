/**
 * PROJ-15 — shared tenant context for /api/vendors/* routes.
 *
 * Resolves "active tenant" from the caller's first tenant_membership.
 * Read paths use memberTenantContext (any tenant member can SELECT vendor
 * data per RLS). Write paths fall through to RLS, which enforces
 * tenant-admin or tenant_role='editor'.
 */

import type { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
} from "@/app/api/_lib/route-helpers"

type Supabase = Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"]

interface VendorRouteContext {
  tenantId: string
  userId: string
  supabase: Supabase
}

export async function vendorTenantContext(): Promise<
  VendorRouteContext | { error: NextResponse }
> {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return { error: apiError("unauthorized", "Not signed in.", 401) }
  }

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

  return { tenantId, userId, supabase }
}
