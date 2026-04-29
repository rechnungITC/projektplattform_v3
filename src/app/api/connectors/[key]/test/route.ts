import { NextResponse } from "next/server"

import { describeConnector } from "@/lib/connectors/registry"
import { CONNECTOR_KEYS, type ConnectorKey } from "@/lib/connectors/types"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../_lib/route-helpers"

// PROJ-14 — test-connection probe.
// POST /api/connectors/[key]/test → re-runs the descriptor's health
// probe against current credentials (decrypted server-side).

interface Ctx {
  params: Promise<{ key: string }>
}

function isKnownKey(key: string): key is ConnectorKey {
  return (CONNECTOR_KEYS as readonly string[]).includes(key)
}

export async function POST(_request: Request, ctx: Ctx) {
  const { key } = await ctx.params
  if (!isKnownKey(key)) return apiError("not_found", "Unknown connector.", 404)

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
    const result = await describeConnector(supabase, tenantId, key)
    if (!result) return apiError("not_found", "Unknown connector.", 404)
    return NextResponse.json({
      health: result.health,
      credential_source: result.credential_source,
    })
  } catch (err) {
    return apiError(
      "test_failed",
      err instanceof Error ? err.message : "Unbekannter Fehler",
      500
    )
  }
}
