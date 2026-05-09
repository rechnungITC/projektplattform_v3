import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantMember,
} from "../_lib/route-helpers"
import { resolveActiveTenantId } from "../_lib/active-tenant"

// PROJ-62 — Read-only landscape that joins organization_units with PROJ-15
// vendors via the SECURITY-INVOKER view `tenant_organization_landscape`.
// Used by the Tree-View "Vendors einblenden"-Toggle.

export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const memberDenial = await requireTenantMember(supabase, tenantId, userId)
  if (memberDenial) return memberDenial

  const { data, error } = await supabase
    .from("tenant_organization_landscape")
    .select("id, tenant_id, name, kind, type, parent_id, location_id")
    .eq("tenant_id", tenantId)
    .order("kind", { ascending: true })
    .order("name", { ascending: true })

  if (error) return apiError("list_failed", error.message, 500)

  return NextResponse.json({ items: data ?? [] })
}
