/**
 * PROJ-15 — shared tenant context for /api/vendors/* routes.
 *
 * PROJ-55-α — resolves the active tenant via the shared
 * {@link resolveActiveTenantId} helper (cookie + membership
 * validation). Multi-workspace users no longer silently fall back
 * to their earliest membership; ambiguous context returns 403.
 *
 * Read paths use vendorTenantContext (any tenant member can SELECT
 * vendor data per RLS). Write paths fall through to RLS, which
 * enforces tenant-admin or tenant_role='editor'.
 */

import type { NextResponse } from "next/server"

import { resolveActiveTenantId } from "@/app/api/_lib/active-tenant"
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

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) {
    return {
      error: apiError(
        "forbidden",
        "Active workspace could not be resolved. Switch workspace and try again.",
        403,
      ),
    }
  }

  return { tenantId, userId, supabase }
}
