/**
 * PROJ-48 β — recent MCP tool-call audit (tenant-admin only).
 *
 *   GET /api/connectors/mcp/audit
 *     → the 50 most recent mcp_tool_calls for the active tenant (no raw
 *       arguments — only the hashed digest, tool name, status, counts and
 *       latency), newest first. Read-only audit surface for the connector
 *       panel.
 */

import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "@/app/api/_lib/route-helpers"

async function resolveAdminTenant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ tenantId: string } | { error: ReturnType<typeof apiError> }> {
  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  const tenantId = membership?.tenant_id as string | undefined
  if (!tenantId) return { error: apiError("forbidden", "No tenant membership.", 403) }
  const denial = await requireTenantAdmin(supabase, tenantId, userId)
  if (denial) return { error: denial }
  return { tenantId }
}

export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const resolved = await resolveAdminTenant(supabase, userId)
  if ("error" in resolved) return resolved.error

  const { data, error } = await supabase
    .from("mcp_tool_calls")
    .select(
      "id, token_id, tool_name, result_row_count, redaction_count, status, latency_ms, created_at",
    )
    .eq("tenant_id", resolved.tenantId)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) return apiError("read_failed", error.message, 500)
  return NextResponse.json({ calls: data ?? [] }, { status: 200 })
}
