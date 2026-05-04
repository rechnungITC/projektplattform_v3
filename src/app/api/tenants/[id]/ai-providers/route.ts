/**
 * PROJ-32-c-β — Tenant AI Providers: collection list endpoint.
 *
 *   GET /api/tenants/[id]/ai-providers
 *
 * Returns a summary array of all configured providers for the tenant.
 * Never returns the encrypted_config — only metadata + fingerprint.
 * Admin-only.
 */

import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../_lib/route-helpers"

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id: tenantId } = await ctx.params

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const denied = await requireTenantAdmin(supabase, tenantId, userId)
  if (denied) return denied

  const { data, error } = await supabase
    .from("tenant_ai_providers")
    .select(
      "provider, key_fingerprint, last_validated_at, last_validation_status, created_at, updated_at",
    )
    .eq("tenant_id", tenantId)
    .order("provider", { ascending: true })

  if (error) return apiError("read_failed", error.message, 500)

  return NextResponse.json({
    providers: (data ?? []).map((row) => ({
      provider: row.provider,
      fingerprint: row.key_fingerprint,
      last_validated_at: row.last_validated_at,
      last_validation_status: row.last_validation_status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })),
  })
}
