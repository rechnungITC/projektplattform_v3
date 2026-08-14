import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../_lib/route-helpers"

// PROJ-45-α — trades assigned to one project.
//
// GET  — list, with the catalog label joined in. The label is READ from the
//        catalog, never stored here, so a rename propagates (lock L7).
// POST — assign a catalog trade to this project. Uniqueness (AC-45.9) and the
//        deactivated-trade rule (AC-45.4) are enforced in the database.

export const PROJECT_TRADE_SELECT =
  "id, tenant_id, project_id, trade_id, responsible_user_id, vendor_id, " +
  "rag_status, notes, sort_order, created_at, updated_at, " +
  "trade:construction_trades(id, key, label, is_active)"

const idSchema = z.string().uuid()

export const assignTradeSchema = z.object({
  trade_id: z.string().uuid(),
  responsible_user_id: z.string().uuid().nullable().optional(),
  vendor_id: z.string().uuid().nullable().optional(),
  rag_status: z.enum(["gruen", "gelb", "rot"]).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  sort_order: z.number().int().min(0).max(100000).optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  if (!idSchema.safeParse(projectId).success) {
    return apiError("invalid_id", "Malformed project id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  // AC-45.24: module off -> the surface answers as if it did not exist.
  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "construction"
  )
  if (moduleDenial) return moduleDenial

  const { data, error } = await supabase
    .from("project_construction_trades")
    .select(PROJECT_TRADE_SELECT)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .limit(500)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ trades: data ?? [] })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  if (!idSchema.safeParse(projectId).success) {
    return apiError("invalid_id", "Malformed project id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "construction",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = assignTradeSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_failed", parsed.error.issues[0].message, 422)
  }

  const { data, error } = await supabase
    .from("project_construction_trades")
    .insert({
      ...parsed.data,
      project_id: projectId,
      tenant_id: access.project.tenant_id,
      created_by: userId,
    })
    .select(PROJECT_TRADE_SELECT)
    .single()

  if (error) {
    if (error.code === "23505") {
      return apiError("already_assigned", "Dieses Gewerk ist dem Projekt bereits zugeordnet.", 409)
    }
    // 23514 covers both the cross-tenant guard and the deactivated-trade rule.
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    if (error.code === "23503") return apiError("invalid_reference", error.message, 422)
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ trade: data }, { status: 201 })
}
