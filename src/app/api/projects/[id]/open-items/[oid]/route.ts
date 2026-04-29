import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

// PROJ-20 — single-open-item endpoints.
// GET    /api/projects/[id]/open-items/[oid]
// PATCH  /api/projects/[id]/open-items/[oid]
// DELETE /api/projects/[id]/open-items/[oid]
//
// PATCH cannot set status='converted' nor write the converted_to_* fields —
// that path is exclusive to the convert-to-* endpoints, which run in an
// atomic SECURITY DEFINER RPC. Open Items are one-way: once converted, the
// CHECK constraint pins them.

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(5000).optional().nullable(),
    status: z.enum(["open", "in_clarification", "closed"] as const).optional(),
    contact: z.string().max(255).optional().nullable(),
    contact_stakeholder_id: z.string().uuid().optional().nullable(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "At least one field must be provided.",
  })

const SELECT_COLUMNS =
  "id, tenant_id, project_id, title, description, status, contact, contact_stakeholder_id, converted_to_entity_type, converted_to_entity_id, created_by, created_at, updated_at"

interface Ctx {
  params: Promise<{ id: string; oid: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id: projectId, oid } = await ctx.params
  if (!z.string().uuid().safeParse(oid).success) {
    return apiError("validation_error", "Invalid open item id.", 400, "oid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "decisions",
    { intent: "read" }
  )
  if (moduleDenial) return moduleDenial

  const { data, error } = await supabase
    .from("open_items")
    .select(SELECT_COLUMNS)
    .eq("project_id", projectId)
    .eq("id", oid)
    .maybeSingle()

  if (error) {
    return apiError("read_failed", error.message, 500)
  }
  if (!data) {
    return apiError("not_found", "Open item not found.", 404)
  }
  return NextResponse.json({ open_item: data })
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id: projectId, oid } = await ctx.params
  if (!z.string().uuid().safeParse(oid).success) {
    return apiError("validation_error", "Invalid open item id.", 400, "oid")
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
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "decisions",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  // Refuse PATCH on already-converted items — they are sealed by design.
  const { data: existing, error: lookupErr } = await supabase
    .from("open_items")
    .select("status")
    .eq("project_id", projectId)
    .eq("id", oid)
    .maybeSingle()
  if (lookupErr) {
    return apiError("read_failed", lookupErr.message, 500)
  }
  if (!existing) {
    return apiError("not_found", "Open item not found.", 404)
  }
  if (existing.status === "converted") {
    return apiError(
      "conflict",
      "Open item already converted; further edits are blocked.",
      409
    )
  }

  const data = parsed.data
  const update: Record<string, unknown> = {}
  if (data.title !== undefined) update.title = data.title.trim()
  if (data.description !== undefined)
    update.description = data.description?.trim() || null
  if (data.status !== undefined) update.status = data.status
  if (data.contact !== undefined) update.contact = data.contact?.trim() || null
  if (data.contact_stakeholder_id !== undefined)
    update.contact_stakeholder_id = data.contact_stakeholder_id ?? null

  const { data: row, error } = await supabase
    .from("open_items")
    .update(update)
    .eq("project_id", projectId)
    .eq("id", oid)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") {
      return apiError("not_found", "Open item not found.", 404)
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("update_failed", error.message, 500)
  }
  return NextResponse.json({ open_item: row })
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id: projectId, oid } = await ctx.params
  if (!z.string().uuid().safeParse(oid).success) {
    return apiError("validation_error", "Invalid open item id.", 400, "oid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "decisions",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  const { error } = await supabase
    .from("open_items")
    .delete()
    .eq("project_id", projectId)
    .eq("id", oid)

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Lead or admin required to delete open items.",
        403
      )
    }
    return apiError("delete_failed", error.message, 500)
  }
  return new NextResponse(null, { status: 204 })
}
