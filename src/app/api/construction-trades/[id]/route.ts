import { NextResponse } from "next/server"
import { z } from "zod"

import { resolveActiveTenantId } from "../../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../_lib/route-helpers"

import {
  CONSTRUCTION_TRADE_SELECT,
  updateConstructionTradeSchema,
} from "../_schema"

// PROJ-45-α — single catalog entry.
//
// PATCH  — rename / reorder / deactivate (tenant admin). A rename propagates
//          to every project by construction: projects reference the catalog row
//          and never store a copy of the label (lock L7 / AC-45.5).
// DELETE — only possible while the trade is unused. The DB enforces this via
//          ON DELETE RESTRICT on project_construction_trades.trade_id; we turn
//          the resulting 23503 into a message that names the projects (AC-45.3).

const idSchema = z.string().uuid()

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!idSchema.safeParse(id).success) {
    return apiError("invalid_id", "Malformed id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const adminDenial = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminDenial) return adminDenial

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = updateConstructionTradeSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_failed", parsed.error.issues[0].message, 422)
  }

  const { data, error } = await supabase
    .from("construction_trades")
    .update(parsed.data)
    .eq("id", id)
    .select(CONSTRUCTION_TRADE_SELECT)
    .maybeSingle()

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("update_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Trade not found.", 404)

  return NextResponse.json({ trade: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!idSchema.safeParse(id).success) {
    return apiError("invalid_id", "Malformed id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const adminDenial = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminDenial) return adminDenial

  const { error } = await supabase.from("construction_trades").delete().eq("id", id)

  if (error) {
    if (error.code === "23503") {
      // Name the blocking projects so the message is actionable (AC-45.3).
      const { data: usage } = await supabase
        .from("project_construction_trades")
        .select("project_id, projects(name)")
        .eq("trade_id", id)
        .limit(10)

      const names = (usage ?? [])
        .map((row) => {
          const project = (row as { projects?: { name?: string } | null }).projects
          return project?.name
        })
        .filter((name): name is string => Boolean(name))

      return apiError(
        "trade_in_use",
        names.length > 0
          ? `Dieses Gewerk ist noch zugeordnet: ${names.join(", ")}. Deaktivieren statt löschen.`
          : "Dieses Gewerk ist noch Projekten zugeordnet. Deaktivieren statt löschen.",
        409
      )
    }
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("delete_failed", error.message, 500)
  }

  return NextResponse.json({ ok: true })
}
