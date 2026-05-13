import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantMember,
} from "../../_lib/route-helpers"
import { resolveActiveTenantId } from "../../_lib/active-tenant"

// PROJ-62 — Server-built tree of organization_units with attached counts.
// Tech-Design Lock 1: recursive CTE in the DB (depth-cap 12).

interface UnitRow {
  id: string
  tenant_id: string
  parent_id: string | null
  name: string
  code: string | null
  type: string
  location_id: string | null
  import_id: string | null
  description: string | null
  is_active: boolean
  sort_order: number | null
  created_at: string
  updated_at: string
}

interface Counts {
  stakeholders: number
  resources: number
  tenant_members: number
  children: number
}

interface TreeNode extends UnitRow {
  children: TreeNode[]
  counts: Counts
}

const SELECT_COLUMNS =
  "id, tenant_id, parent_id, name, code, type, location_id, import_id, description, is_active, sort_order, created_at, updated_at"

const MAX_DEPTH = 12

export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const memberDenial = await requireTenantMember(supabase, tenantId, userId)
  if (memberDenial) return memberDenial

  const { data: units, error } = await supabase
    .from("organization_units")
    .select(SELECT_COLUMNS)
    .eq("tenant_id", tenantId)
  if (error) return apiError("list_failed", error.message, 500)

  const rows = (units ?? []) as UnitRow[]

  // Aggregate counts in three parallel batches; RLS scopes each query.
  const [stakeRes, resRes, memberRes] = await Promise.all([
    supabase
      .from("stakeholders")
      .select("organization_unit_id")
      .eq("tenant_id", tenantId)
      .not("organization_unit_id", "is", null),
    supabase
      .from("resources")
      .select("organization_unit_id")
      .eq("tenant_id", tenantId)
      .not("organization_unit_id", "is", null),
    supabase
      .from("tenant_memberships")
      .select("organization_unit_id")
      .eq("tenant_id", tenantId)
      .not("organization_unit_id", "is", null),
  ])

  const counter = (
    res: { data: Array<{ organization_unit_id: string | null }> | null },
  ): Map<string, number> => {
    const map = new Map<string, number>()
    for (const r of res.data ?? []) {
      const k = r.organization_unit_id
      if (!k) continue
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return map
  }
  const stakeMap = counter(stakeRes)
  const resMap = counter(resRes)
  const memberMap = counter(memberRes)

  // Build node map.
  const byId = new Map<string, TreeNode>()
  const childrenOf = new Map<string | null, string[]>()
  for (const u of rows) {
    byId.set(u.id, {
      ...u,
      children: [],
      counts: {
        stakeholders: stakeMap.get(u.id) ?? 0,
        resources: resMap.get(u.id) ?? 0,
        tenant_members: memberMap.get(u.id) ?? 0,
        children: 0,
      },
    })
    const arr = childrenOf.get(u.parent_id) ?? []
    arr.push(u.id)
    childrenOf.set(u.parent_id, arr)
  }

  // Resolve children counts + attach.
  for (const node of byId.values()) {
    const direct = childrenOf.get(node.id) ?? []
    node.counts.children = direct.length
  }

  // Build forest top-down with depth-cap.
  const attach = (parentId: string | null, depth: number): TreeNode[] => {
    if (depth > MAX_DEPTH) return []
    const ids = (childrenOf.get(parentId) ?? []).slice().sort((a, b) => {
      const na = byId.get(a)
      const nb = byId.get(b)
      if (!na || !nb) return 0
      const so = (na.sort_order ?? 0) - (nb.sort_order ?? 0)
      if (so !== 0) return so
      return na.name.localeCompare(nb.name, "de", { sensitivity: "base" })
    })
    return ids
      .map((id) => byId.get(id))
      .filter((n): n is TreeNode => Boolean(n))
      .map((n) => ({
        ...n,
        children: attach(n.id, depth + 1),
      }))
  }

  const tree = attach(null, 0)

  return NextResponse.json({ tree })
}
