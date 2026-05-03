import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"
import {
  normalizeVendorAssignmentPayload,
  vendorAssignmentPatchSchema as patchSchema,
} from "../_schema"

// PROJ-15 — single project-vendor-assignment.
// PATCH  /api/projects/[id]/vendor-assignments/[aid]
// DELETE /api/projects/[id]/vendor-assignments/[aid]

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
  params: Promise<{ id: string; aid: string }>
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id: projectId, aid } = await ctx.params
  if (!z.string().uuid().safeParse(aid).success) {
    return apiError("validation_error", "Invalid assignment id.", 400, "aid")
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
  const update = normalizeVendorAssignmentPayload(parsed.data)

  const { data: row, error } = await supabase
    .from("vendor_project_assignments")
    .update(update)
    .eq("id", aid)
    .eq("project_id", projectId)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") {
      return apiError("not_found", "Assignment not found.", 404)
    }
    if (error.code === "23505") {
      return apiError(
        "duplicate",
        "Dieser Vendor ist mit der neuen Rolle bereits dem Projekt zugeordnet.",
        409
      )
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("update_failed", error.message, 500)
  }

  const enriched = row as unknown as DBRow
  return NextResponse.json({
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
  })
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id: projectId, aid } = await ctx.params
  if (!z.string().uuid().safeParse(aid).success) {
    return apiError("validation_error", "Invalid assignment id.", 400, "aid")
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

  const { error } = await supabase
    .from("vendor_project_assignments")
    .delete()
    .eq("id", aid)
    .eq("project_id", projectId)

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Editor or lead role required.", 403)
    }
    return apiError("delete_failed", error.message, 500)
  }
  return new NextResponse(null, { status: 204 })
}
