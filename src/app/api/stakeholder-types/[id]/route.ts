/**
 * PROJ-33 Phase 33-β — single stakeholder-type endpoints.
 *
 * PATCH  /api/stakeholder-types/[id]  — tenant-admin edits own row
 * DELETE /api/stakeholder-types/[id]  — soft-delete via is_active=false
 *
 * Globale Defaults (tenant_id IS NULL) are RLS-immutable — UPDATE/DELETE
 * silently no-ops at the policy level; we still surface a clear 403 for UX.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../_lib/route-helpers"

const SELECT_COLUMNS =
  "id, tenant_id, key, label_de, label_en, color, display_order, is_active, created_at, updated_at"

const patchSchema = z
  .object({
    label_de: z.string().trim().min(1).max(100).optional(),
    label_en: z.string().trim().max(100).optional().nullable(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Hex color required (#rrggbb)")
      .optional(),
    display_order: z.number().int().min(0).max(10000).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "At least one field must be provided.",
  })

interface Ctx {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // Lookup target row to determine tenant_id (RLS already gates SELECT).
  const { data: target, error: lookupErr } = await supabase
    .from("stakeholder_type_catalog")
    .select("id, tenant_id")
    .eq("id", id)
    .maybeSingle()
  if (lookupErr) return apiError("internal_error", lookupErr.message, 500)
  if (!target) return apiError("not_found", "Type not found.", 404)
  if (!target.tenant_id) {
    return apiError("forbidden", "Global defaults are immutable.", 403)
  }

  const adminDenial = await requireTenantAdmin(supabase, target.tenant_id, userId)
  if (adminDenial) return adminDenial

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString(),
    )
  }

  const { data, error } = await supabase
    .from("stakeholder_type_catalog")
    .update(parsed.data)
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single()
  if (error) return apiError("update_failed", error.message, 500)

  return NextResponse.json({ type: data })
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: target, error: lookupErr } = await supabase
    .from("stakeholder_type_catalog")
    .select("id, tenant_id")
    .eq("id", id)
    .maybeSingle()
  if (lookupErr) return apiError("internal_error", lookupErr.message, 500)
  if (!target) return apiError("not_found", "Type not found.", 404)
  if (!target.tenant_id) {
    return apiError("forbidden", "Global defaults are immutable.", 403)
  }

  const adminDenial = await requireTenantAdmin(supabase, target.tenant_id, userId)
  if (adminDenial) return adminDenial

  // Soft-delete: existing stakeholders that reference this key keep the
  // string but the validation-trigger will reject NEW inserts/updates with
  // it. UI shows "(deactivated)" badge.
  const { error: updErr } = await supabase
    .from("stakeholder_type_catalog")
    .update({ is_active: false })
    .eq("id", id)
  if (updErr) return apiError("delete_failed", updErr.message, 500)

  return NextResponse.json({ ok: true })
}
