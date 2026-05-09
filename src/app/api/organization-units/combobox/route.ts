import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantMember,
} from "../../_lib/route-helpers"
import { resolveActiveTenantId } from "../../_lib/active-tenant"

// PROJ-62 — Shared typeahead endpoint.
// GET /api/organization-units/combobox?q=...&type=team,department
// Used by Org-Edit-Dialog parent-picker, table bulk-move, and the future
// PROJ-57-β person/stakeholder/resource form. Max 20 results.

const MAX_RESULTS = 20
const TYPE_VALUES = new Set([
  "group",
  "company",
  "department",
  "team",
  "project_org",
  "external_org",
])

interface UnitRow {
  id: string
  parent_id: string | null
  name: string
  type: string
  is_active: boolean
}

export async function GET(request: Request) {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const memberDenial = await requireTenantMember(supabase, tenantId, userId)
  if (memberDenial) return memberDenial

  const url = new URL(request.url)
  const q = (url.searchParams.get("q") ?? "").trim()
  const typeParam = url.searchParams.get("type")
  const types =
    typeParam && typeParam.length > 0
      ? typeParam
          .split(",")
          .map((s) => s.trim())
          .filter((s) => TYPE_VALUES.has(s))
      : null

  // Pull a limited slice for breadcrumb resolution. We need the full
  // tenant set to walk parent ids — but the in-memory build is bounded
  // by typical tenant sizes (< 5000 nodes for the targeted pilot).
  const { data: allRows, error: allErr } = await supabase
    .from("organization_units")
    .select("id, parent_id, name, type, is_active")
    .eq("tenant_id", tenantId)
  if (allErr) return apiError("list_failed", allErr.message, 500)

  const all = (allRows ?? []) as UnitRow[]
  const byId = new Map<string, UnitRow>()
  for (const r of all) byId.set(r.id, r)

  const breadcrumbOf = (id: string): string => {
    const parts: string[] = []
    let current: UnitRow | undefined = byId.get(id)
    let guard = 0
    while (current && guard < 100) {
      parts.unshift(current.name)
      if (!current.parent_id) break
      current = byId.get(current.parent_id)
      guard += 1
    }
    return parts.join(" › ")
  }

  const lower = q.toLowerCase()
  const filtered = all
    .filter((r) => r.is_active)
    .filter((r) => (types ? types.includes(r.type) : true))
    .filter((r) => (lower ? r.name.toLowerCase().includes(lower) : true))
    .slice(0, MAX_RESULTS)
    .map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      breadcrumb_path: breadcrumbOf(r.id),
      is_active: r.is_active,
    }))

  return NextResponse.json({ items: filtered })
}
