/**
 * PROJ-16 / PROJ-5 — shared helpers for master-data routes.
 *
 * Two flavors:
 *   adminTenantContext  — for write-paths (PUT / DELETE)
 *   memberTenantContext — for read-paths the wizard + non-admin users hit
 *
 * PROJ-55-α — both flavours now go through the shared
 * {@link resolveActiveTenantId} helper. Multi-workspace users get
 * a 403 instead of silently writing to their oldest tenant when no
 * `active_tenant_id` cookie is set.
 */

import type { NextResponse } from "next/server"

import { resolveActiveTenantId } from "@/app/api/_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "@/app/api/_lib/route-helpers"

type Supabase = Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"]

interface TenantContext {
  tenantId: string
  userId: string
  supabase: Supabase
}

async function resolveActiveTenant(): Promise<
  TenantContext | { error: NextResponse }
> {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return { error: apiError("unauthorized", "Not signed in.", 401) }

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

/** Read + write paths that require tenant_admin. */
export async function adminTenantContext(): Promise<
  TenantContext | { error: NextResponse }
> {
  const ctx = await resolveActiveTenant()
  if ("error" in ctx) return ctx

  const adminDenial = await requireTenantAdmin(ctx.supabase, ctx.tenantId, ctx.userId)
  if (adminDenial) return { error: adminDenial }

  return ctx
}

/** Read-only paths the wizard hits — any tenant_member is OK. */
export async function memberTenantContext(): Promise<
  TenantContext | { error: NextResponse }
> {
  // The membership lookup above already proves "is a member of this tenant"
  // (it found a tenant_memberships row for the caller in `tenantId`). RLS
  // on every read-target uses is_tenant_member, so no additional check
  // is needed here — RLS does the second-line gate.
  return resolveActiveTenant()
}
