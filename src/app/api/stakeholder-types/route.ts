/**
 * PROJ-33 Phase 33-β — stakeholder-type-catalog collection endpoints.
 *
 * GET  /api/stakeholder-types  — list active types (global + tenant)
 * POST /api/stakeholder-types  — tenant-admin only, creates a tenant-owned type
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import { resolveActiveTenantId } from "../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../_lib/route-helpers"

const SELECT_COLUMNS =
  "id, tenant_id, key, label_de, label_en, color, display_order, is_active, created_at, updated_at"

const createSchema = z.object({
  key: z.string().trim().min(1).max(64),
  label_de: z.string().trim().min(1).max(100),
  label_en: z.string().trim().max(100).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Hex color required (#rrggbb)"),
  display_order: z.number().int().min(0).max(10000).optional(),
  is_active: z.boolean().optional(),
})

// PROJ-55-α — uses the shared cookie-aware resolver from
// `@/app/api/_lib/active-tenant` (imported below).

export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // RLS handles tenant-scoping (SELECT erlaubt tenant_id IS NULL OR member).
  const { data, error } = await supabase
    .from("stakeholder_type_catalog")
    .select(SELECT_COLUMNS)
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("label_de", { ascending: true })
  if (error) return apiError("list_failed", error.message, 500)

  return NextResponse.json({ types: data ?? [] })
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
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString(),
    )
  }

  // Disallow keys reserved as global defaults (UNIQUE-Constraint würde es
  // nur abfangen wenn der globale Default tenant_id IS NULL hat — was er
  // tut. Trotzdem höflicher Fehler vor DB-Round-Trip.)
  const { data: globalConflict } = await supabase
    .from("stakeholder_type_catalog")
    .select("id")
    .is("tenant_id", null)
    .eq("key", parsed.data.key.toLowerCase())
    .maybeSingle()
  if (globalConflict) {
    return apiError(
      "conflict",
      `Key "${parsed.data.key}" is a global default — pick a different key.`,
      409,
      "key",
    )
  }

  const { data, error } = await supabase
    .from("stakeholder_type_catalog")
    .insert({
      tenant_id: tenantId,
      key: parsed.data.key.toLowerCase(),
      label_de: parsed.data.label_de,
      label_en: parsed.data.label_en ?? null,
      color: parsed.data.color,
      display_order: parsed.data.display_order ?? 0,
      is_active: parsed.data.is_active ?? true,
    })
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "23505") {
      return apiError(
        "conflict",
        "A type with this key already exists for your tenant.",
        409,
        "key",
      )
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ type: data }, { status: 201 })
}
