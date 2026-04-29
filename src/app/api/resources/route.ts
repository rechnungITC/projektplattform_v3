import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"
import { RESOURCE_KINDS } from "@/types/resource"

import {
  apiError,
  getAuthenticatedUserId,
} from "../_lib/route-helpers"

// PROJ-11 — tenant-scoped resources collection.
// GET  /api/resources?active_only=&kind=
// POST /api/resources

const SELECT_COLUMNS =
  "id, tenant_id, source_stakeholder_id, linked_user_id, display_name, kind, fte_default, availability_default, is_active, created_by, created_at, updated_at"

const createSchema = z.object({
  display_name: z.string().trim().min(1).max(200),
  kind: z.enum(RESOURCE_KINDS as unknown as [string, ...string[]]).default("internal"),
  fte_default: z.number().min(0).max(1).default(1),
  availability_default: z.number().min(0).max(1).default(1),
  is_active: z.boolean().default(true),
  source_stakeholder_id: z.string().uuid().optional().nullable(),
  linked_user_id: z.string().uuid().optional().nullable(),
})

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

  const data = parsed.data
  const insertPayload = {
    tenant_id: tenantId,
    display_name: data.display_name.trim(),
    kind: data.kind,
    fte_default: data.fte_default,
    availability_default: data.availability_default,
    is_active: data.is_active,
    source_stakeholder_id: data.source_stakeholder_id ?? null,
    linked_user_id: data.linked_user_id ?? null,
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
