import { NextResponse } from "next/server"

import { requireModuleActive } from "@/lib/tenant-settings/server"
import { RESOURCE_KINDS } from "@/types/resource"

import {
  apiError,
  getAuthenticatedUserId,
} from "../_lib/route-helpers"

import { normalizeResourcePayload, resourceCreateSchema as createSchema } from "./_schema"

// PROJ-11 — tenant-scoped resources collection.
// GET  /api/resources?active_only=&kind=
// POST /api/resources

// PROJ-54-α — `daily_rate_override` and `daily_rate_override_currency`
// are Class-3 PII (Personalkosten). They are returned to all tenant
// members in α to support the Stammdaten-list. A future hardening Slice
// can mask them for non-admins (separate response shape) — out of
// PROJ-54-α scope.
const SELECT_COLUMNS =
  "id, tenant_id, source_stakeholder_id, linked_user_id, display_name, kind, fte_default, availability_default, is_active, daily_rate_override, daily_rate_override_currency, created_by, created_at, updated_at"

async function activeTenantId(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"],
  userId: string
): Promise<string | null> {
  // Tenant resources don't take a project — derive the active tenant
  // from the caller's first tenant_membership. The frontend already
  // passes the active tenant via cookie, but for server-side routes we
  // re-resolve via membership to keep RLS in charge.
  const { data } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data?.tenant_id as string | undefined) ?? null
}

export async function GET(request: Request) {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await activeTenantId(supabase, userId)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const moduleDenial = await requireModuleActive(
    supabase,
    tenantId,
    "resources",
    { intent: "read" }
  )
  if (moduleDenial) return moduleDenial

  const url = new URL(request.url)
  const activeOnly = url.searchParams.get("active_only") === "true"
  const kind = url.searchParams.get("kind")

  let query = supabase
    .from("resources")
    .select(SELECT_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("display_name", { ascending: true })
    .limit(1000)

  if (activeOnly) query = query.eq("is_active", true)
  if (kind && (RESOURCE_KINDS as readonly string[]).includes(kind)) {
    query = query.eq("kind", kind)
  }

  const { data, error } = await query
  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ resources: data ?? [] })
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = createSchema.safeParse(body)
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

  const tenantId = await activeTenantId(supabase, userId)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const moduleDenial = await requireModuleActive(
    supabase,
    tenantId,
    "resources",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  // PROJ-54-α — Override-Felder dürfen nur Tenant-Admins setzen.
  const wantsOverride =
    parsed.data.daily_rate_override !== undefined &&
    parsed.data.daily_rate_override !== null
  if (wantsOverride) {
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
        "Tenant-Admin-Rolle erforderlich, um einen eigenen Tagessatz zu setzen.",
        403
      )
    }
  }

  // Spread-Pattern: schema is the single source of truth.
  const insertPayload = {
    ...normalizeResourcePayload(parsed.data),
    tenant_id: tenantId,
    created_by: userId,
  }

  const { data: row, error } = await supabase
    .from("resources")
    .insert(insertPayload)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Editor or admin role required.", 403)
    }
    if (error.code === "23505") {
      return apiError(
        "duplicate",
        "This user is already represented as a resource in this tenant.",
        409
      )
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("create_failed", error.message, 500)
  }
  return NextResponse.json({ resource: row }, { status: 201 })
}
