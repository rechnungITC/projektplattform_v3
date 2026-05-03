import { NextResponse } from "next/server"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../_lib/route-helpers"
import {
  normalizeVendorAssignmentPayload,
  vendorAssignmentCreateSchema as createSchema,
} from "./_schema"

// PROJ-15 — project ↔ vendor assignments.
// GET  /api/projects/[id]/vendor-assignments  → list with vendor name
// POST /api/projects/[id]/vendor-assignments  (editor+/lead/admin)

const SELECT_COLUMNS = `
  id, tenant_id, project_id, vendor_id, role, scope_note, valid_from, valid_until, created_by, created_at, updated_at,
  vendors:vendor_id ( name )
`.replace(/\s+/g, " ").trim()

interface DBRow {
  id: string
  tenant_id: string
  project_id: string
  vendor_id: string
  role: string
  scope_note: string | null
  valid_from: string | null
  valid_until: string | null
  created_by: string
  created_at: string
  updated_at: string
  vendors: { name: string | null } | { name: string | null }[] | null
}

function vendorNameFrom(row: DBRow): string {
  if (!row.vendors) return ""
  if (Array.isArray(row.vendors)) return row.vendors[0]?.name ?? ""
  return row.vendors.name ?? ""
}

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "vendor",
    { intent: "read" }
  )
  if (moduleDenial) return moduleDenial

  const { data, error } = await supabase
    .from("vendor_project_assignments")
    .select(SELECT_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) return apiError("list_failed", error.message, 500)

  const assignments = ((data ?? []) as unknown as DBRow[]).map((r) => ({
    id: r.id,
    tenant_id: r.tenant_id,
    project_id: r.project_id,
    vendor_id: r.vendor_id,
    role: r.role,
    scope_note: r.scope_note,
    valid_from: r.valid_from,
    valid_until: r.valid_until,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
    vendor_name: vendorNameFrom(r),
  }))

  return NextResponse.json({ assignments })
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params

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

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "vendor",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  // Spread-Pattern: schema is the single source of truth.
  const insertPayload = {
    ...normalizeVendorAssignmentPayload(parsed.data),
    tenant_id: access.project.tenant_id,
    project_id: projectId,
    created_by: userId,
  }

  const { data: row, error } = await supabase
    .from("vendor_project_assignments")
    .insert(insertPayload)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Editor or lead role required.", 403)
    }
    if (error.code === "23505") {
      return apiError(
        "duplicate",
        "Dieser Vendor ist mit dieser Rolle bereits dem Projekt zugeordnet.",
        409
      )
    }
    if (error.code === "23503") {
      return apiError(
        "invalid_reference",
        "Vendor not found in this tenant.",
        422
      )
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("create_failed", error.message, 500)
  }

  const enriched = row as unknown as DBRow
  return NextResponse.json(
    {
      assignment: {
        id: enriched.id,
        tenant_id: enriched.tenant_id,
        project_id: enriched.project_id,
        vendor_id: enriched.vendor_id,
        role: enriched.role,
        scope_note: enriched.scope_note,
        valid_from: enriched.valid_from,
        valid_until: enriched.valid_until,
        created_by: enriched.created_by,
        created_at: enriched.created_at,
        updated_at: enriched.updated_at,
        vendor_name: vendorNameFrom(enriched),
      },
    },
    { status: 201 }
  )
}
