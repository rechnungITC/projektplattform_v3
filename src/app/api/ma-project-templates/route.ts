import { NextResponse } from "next/server"

import { resolveActiveTenantId } from "../_lib/active-tenant"
import { apiError, getAuthenticatedUserId } from "../_lib/route-helpers"

// PROJ-96 (AC1/AC2/AC3) — M&A project template catalog (tenant-scoped).
//
// GET /api/ma-project-templates
//   Lazy-seeds the Buy-Side default (idempotent) then lists the tenant's
//   templates with their workstreams + deliverables. Used by the wizard
//   template picker (before a project exists) and the admin catalog view.
//   RLS scopes every row to the caller's tenant.
//
// Flat selects (no embedded resources) keep the schema-drift guard happy.
const TEMPLATE_COLUMNS =
  "id, tenant_id, template_key, name, deal_side, description, version, is_active, created_at, updated_at"
const WORKSTREAM_COLUMNS =
  "id, template_id, workstream_key, label, goal, confidentiality_level, sort_order"
const DELIVERABLE_COLUMNS =
  "id, template_id, workstream_key, name, description, status, confidentiality_level, sort_order"

export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  // Best-effort lazy seed of the Buy-Side default (idempotent; ignore failures
  // so an empty catalog still lists rather than erroring).
  await supabase.rpc("ensure_default_ma_project_templates", {
    p_tenant_id: tenantId,
  })

  const { data: templates, error: tErr } = await supabase
    .from("ma_project_templates")
    .select(TEMPLATE_COLUMNS)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true })
    .limit(200)
  if (tErr) return apiError("list_failed", tErr.message, 500)

  const templateIds = (templates ?? []).map((t) => t.id as string)
  if (templateIds.length === 0) {
    return NextResponse.json({ templates: [] })
  }

  const [wsRes, delRes] = await Promise.all([
    supabase
      .from("ma_template_workstreams")
      .select(WORKSTREAM_COLUMNS)
      .in("template_id", templateIds)
      .order("sort_order", { ascending: true }),
    supabase
      .from("ma_template_deliverables")
      .select(DELIVERABLE_COLUMNS)
      .in("template_id", templateIds)
      .order("sort_order", { ascending: true }),
  ])
  if (wsRes.error) return apiError("list_failed", wsRes.error.message, 500)
  if (delRes.error) return apiError("list_failed", delRes.error.message, 500)

  const workstreams = wsRes.data ?? []
  const deliverables = delRes.data ?? []

  const assembled = (templates ?? []).map((t) => ({
    ...t,
    workstreams: workstreams.filter((w) => w.template_id === t.id),
    deliverables: deliverables.filter((d) => d.template_id === t.id),
  }))

  return NextResponse.json({ templates: assembled })
}
