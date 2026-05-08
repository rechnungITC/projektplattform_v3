import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
} from "../../_lib/route-helpers"
import { normalizeResourcePayload, resourcePatchSchema as patchSchema } from "../_schema"

// PROJ-11 — single-resource endpoints.
// GET    /api/resources/[rid]
// PATCH  /api/resources/[rid]
// DELETE /api/resources/[rid]

// PROJ-54-α — Override-Spalten in der Antwort exposed (s. Hinweis im
// `route.ts` der Collection).
const SELECT_COLUMNS =
  "id, tenant_id, source_stakeholder_id, linked_user_id, display_name, kind, fte_default, availability_default, is_active, daily_rate_override, daily_rate_override_currency, created_by, created_at, updated_at"

interface Ctx {
  params: Promise<{ rid: string }>
}

async function loadResource(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"],
  resourceId: string
) {
  return supabase
    .from("resources")
    .select(SELECT_COLUMNS)
    .eq("id", resourceId)
    .maybeSingle()
}

export async function GET(_request: Request, ctx: Ctx) {
  const { rid } = await ctx.params
  if (!z.string().uuid().safeParse(rid).success) {
    return apiError("validation_error", "Invalid resource id.", 400, "rid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data, error } = await loadResource(supabase, rid)
  if (error) return apiError("read_failed", error.message, 500)
  if (!data) return apiError("not_found", "Resource not found.", 404)

  const moduleDenial = await requireModuleActive(
    supabase,
    data.tenant_id as string,
    "resources",
    { intent: "read" }
  )
  if (moduleDenial) return moduleDenial

  return NextResponse.json({ resource: data })
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { rid } = await ctx.params
  if (!z.string().uuid().safeParse(rid).success) {
    return apiError("validation_error", "Invalid resource id.", 400, "rid")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: existing, error: existingErr } = await loadResource(supabase, rid)
  if (existingErr) return apiError("read_failed", existingErr.message, 500)
  if (!existing) return apiError("not_found", "Resource not found.", 404)

  const moduleDenial = await requireModuleActive(
    supabase,
    existing.tenant_id as string,
    "resources",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  // PROJ-54-β — Optimistic Lock via If-Unmodified-Since.
  // Caller sends the resource's `updated_at` as ISO string. If the row
  // has been touched in between (a second editor saved or the recompute
  // hook from γ wrote something), the DB timestamp is newer and we
  // reject the PATCH with 409 instead of silently overwriting.
  const ifUnmod = request.headers.get("if-unmodified-since")
  if (ifUnmod) {
    const headerMs = Date.parse(ifUnmod)
    const dbMs = Date.parse(existing.updated_at as string)
    if (Number.isFinite(headerMs) && Number.isFinite(dbMs) && dbMs > headerMs) {
      return apiError(
        "stale_record",
        "Die Ressource wurde inzwischen geändert. Lade die Seite neu und versuche es erneut.",
        409
      )
    }
  }

  // PROJ-54-α — Override-Spalten dürfen nur von Tenant-Admins geschrieben
  // werden. Wir prüfen, ob die Felder im Payload sind (egal ob Wert oder
  // explizit `null` zum Löschen) und gaten admin-only.
  const touchesOverride =
    Object.prototype.hasOwnProperty.call(parsed.data, "daily_rate_override") ||
    Object.prototype.hasOwnProperty.call(
      parsed.data,
      "daily_rate_override_currency"
    )
  if (touchesOverride) {
    const tenantId = existing.tenant_id as string
    const { data: membership } = await supabase
      .from("tenant_memberships")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .maybeSingle()
    const role = (membership as { role?: string } | null)?.role
    if (role !== "admin") {
      return apiError(
        "forbidden",
        "Tenant-Admin-Rolle erforderlich, um den Tagessatz-Override zu ändern.",
        403
      )
    }
  }

  // Spread-Pattern: schema is the single source of truth.
  const update = normalizeResourcePayload(parsed.data)

  const { data: row, error } = await supabase
    .from("resources")
    .update(update)
    .eq("id", rid)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") {
      return apiError("forbidden", "Editor or admin role required.", 403)
    }
    if (error.code === "23505") {
      return apiError(
        "duplicate",
        "Another resource is already linked to this user.",
        409
      )
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("update_failed", error.message, 500)
  }
  return NextResponse.json({ resource: row })
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { rid } = await ctx.params
  if (!z.string().uuid().safeParse(rid).success) {
    return apiError("validation_error", "Invalid resource id.", 400, "rid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: existing, error: existingErr } = await loadResource(supabase, rid)
  if (existingErr) return apiError("read_failed", existingErr.message, 500)
  if (!existing) return apiError("not_found", "Resource not found.", 404)

  const moduleDenial = await requireModuleActive(
    supabase,
    existing.tenant_id as string,
    "resources",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  const { error } = await supabase
    .from("resources")
    .delete()
    .eq("id", rid)

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Admin role required to delete resources.", 403)
    }
    if (error.code === "23503") {
      return apiError(
        "in_use",
        "Resource is allocated to work items. Deactivate it instead.",
        409
      )
    }
    return apiError("delete_failed", error.message, 500)
  }
  return new NextResponse(null, { status: 204 })
}
