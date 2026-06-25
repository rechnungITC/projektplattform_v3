import { NextResponse } from "next/server"

import { resolveActiveTenantId } from "../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../_lib/route-helpers"

import { createTemplateSchema, TEMPLATE_SELECT } from "./_schema"

// PROJ-112 — DD-stream template catalog (tenant-scoped).
//
// GET  /api/dd-stream-templates  — list the tenant's templates (any member).
//      First access lazily seeds the 6 standard streams (race-safe, via
//      ensure_default_dd_stream_templates SECURITY DEFINER RPC).
// POST /api/dd-stream-templates  — add a custom template (tenant-admin only).

export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  // Lazy seed (idempotent, ON CONFLICT DO NOTHING inside the RPC).
  const { error: seedError } = await supabase.rpc(
    "ensure_default_dd_stream_templates",
    { p_tenant_id: tenantId }
  )
  if (seedError) return apiError("seed_failed", seedError.message, 500)

  const { data, error } = await supabase
    .from("dd_stream_templates")
    .select(TEMPLATE_SELECT)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true })
    .limit(200)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ templates: data ?? [] })
}

export async function POST(request: Request) {
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
  const parsed = createTemplateSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { data, error } = await supabase
    .from("dd_stream_templates")
    .insert({
      tenant_id: tenantId,
      stream_key: parsed.data.stream_key,
      label: parsed.data.label,
      description: parsed.data.description ?? null,
      sort_order: parsed.data.sort_order ?? 0,
      is_active: parsed.data.is_active ?? true,
      created_by: userId,
    })
    .select(TEMPLATE_SELECT)
    .single()

  if (error) {
    if (error.code === "23505") {
      return apiError(
        "conflict",
        "A template with this key already exists for your tenant.",
        409,
        "stream_key"
      )
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ template: data }, { status: 201 })
}
