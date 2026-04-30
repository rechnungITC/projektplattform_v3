/**
 * PROJ-16 / PROJ-5 — shared helpers for master-data routes.
 *
 * Two flavors:
 *   adminTenantContext  — for write-paths (PUT / DELETE)
 *   memberTenantContext — for read-paths the wizard + non-admin users hit
 *
 * Both resolve "the caller's active tenant" via the first tenant_membership
 * row. Same pattern as PROJ-14 connector routes.
 */

import type { NextResponse } from "next/server"

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
