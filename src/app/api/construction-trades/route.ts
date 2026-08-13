import { NextResponse } from "next/server"

import { resolveActiveTenantId } from "../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../_lib/route-helpers"

import {
  CONSTRUCTION_TRADE_SELECT,
  createConstructionTradeSchema,
} from "./_schema"

// PROJ-45-α — tenant-wide trade catalog.
//
// GET  /api/construction-trades       — list (any tenant member; RLS scopes
//      rows to the caller's tenant). Includes inactive entries so the admin UI
//      can show and reactivate them (AC-45.4).
// POST /api/construction-trades       — create (tenant admin only, AC-45.2).
// POST /api/construction-trades?seed=1 — lazy-seed the VOB/C-flavoured default
//      list, but only while the catalog is completely empty (Q1). The RPC
//      re-checks tenant-admin itself, so this is not the only gate.

export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data, error } = await supabase
    .from("construction_trades")
    .select(CONSTRUCTION_TRADE_SELECT)
    .order("is_active", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true })
    .limit(500)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ trades: data ?? [] })
}

export async function POST(request: Request) {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const adminDenial = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminDenial) return adminDenial

  const url = new URL(request.url)
  if (url.searchParams.get("seed") === "1") {
    const { data, error } = await supabase.rpc(
      "seed_construction_trades_if_empty",
      { p_tenant_id: tenantId }
    )
    if (error) return apiError("seed_failed", error.message, 500)
    return NextResponse.json({ seeded: data ?? 0 }, { status: 201 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = createConstructionTradeSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_failed", parsed.error.issues[0].message, 422)
  }

  const { data, error } = await supabase
    .from("construction_trades")
    .insert({ ...parsed.data, tenant_id: tenantId, created_by: userId })
    .select(CONSTRUCTION_TRADE_SELECT)
    .single()

  if (error) {
    // Unique (tenant_id, key) — the catalog key is the stable identity.
    if (error.code === "23505") {
      return apiError("duplicate_key", "Dieses Gewerk-Kürzel gibt es bereits.", 409)
    }
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ trade: data }, { status: 201 })
}
