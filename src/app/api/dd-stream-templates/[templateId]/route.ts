import { NextResponse } from "next/server"
import { z } from "zod"

import { resolveActiveTenantId } from "../../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../_lib/route-helpers"

import { TEMPLATE_SELECT, updateTemplateSchema } from "../_schema"

// PROJ-112 — single DD-stream template management (tenant-admin only).
//
// PATCH  /api/dd-stream-templates/[templateId]  — edit label/description/sort
//        or deactivate (is_active=false). Deactivating does NOT touch streams
//        already activated from this template (copy-on-create semantics).
// DELETE /api/dd-stream-templates/[templateId]  — hard delete (UI prefers deactivate).

export async function PATCH(
  request: Request,
  context: { params: Promise<{ templateId: string }> }
) {
  const { templateId } = await context.params
  if (!z.string().uuid().safeParse(templateId).success) {
    return apiError("validation_error", "Invalid template id.", 400, "templateId")
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
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = updateTemplateSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const patch: Record<string, unknown> = {}
  if (parsed.data.label !== undefined) patch.label = parsed.data.label
  if (parsed.data.description !== undefined)
    patch.description = parsed.data.description ?? null
  if (parsed.data.sort_order !== undefined) patch.sort_order = parsed.data.sort_order
  if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active

  const { data, error } = await supabase
    .from("dd_stream_templates")
    .update(patch)
    .eq("id", templateId)
    .eq("tenant_id", tenantId)
    .select(TEMPLATE_SELECT)
    .maybeSingle()

  if (error) return apiError("update_failed", error.message, 500)
  if (!data) return apiError("not_found", "Template not found.", 404)

  return NextResponse.json({ template: data })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ templateId: string }> }
) {
  const { templateId } = await context.params
  if (!z.string().uuid().safeParse(templateId).success) {
    return apiError("validation_error", "Invalid template id.", 400, "templateId")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const adminDenial = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminDenial) return adminDenial

  const { error } = await supabase
    .from("dd_stream_templates")
    .delete()
    .eq("id", templateId)
    .eq("tenant_id", tenantId)

  if (error) return apiError("delete_failed", error.message, 500)
  return NextResponse.json({ ok: true })
}
