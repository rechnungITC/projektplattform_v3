import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"
import { RESOURCE_KINDS } from "@/types/resource"

import {
  apiError,
  getAuthenticatedUserId,
} from "../../_lib/route-helpers"

// PROJ-11 — single-resource endpoints.
// GET    /api/resources/[rid]
// PATCH  /api/resources/[rid]
// DELETE /api/resources/[rid]

const SELECT_COLUMNS =
  "id, tenant_id, source_stakeholder_id, linked_user_id, display_name, kind, fte_default, availability_default, is_active, created_by, created_at, updated_at"

const patchSchema = z
  .object({
    display_name: z.string().trim().min(1).max(200).optional(),
    kind: z
      .enum(RESOURCE_KINDS as unknown as [string, ...string[]])
      .optional(),
    fte_default: z.number().min(0).max(1).optional(),
    availability_default: z.number().min(0).max(1).optional(),
    is_active: z.boolean().optional(),
    linked_user_id: z.string().uuid().optional().nullable(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "At least one field must be provided.",
  })

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

  const data = parsed.data
  const update: Record<string, unknown> = {}
  if (data.display_name !== undefined) update.display_name = data.display_name.trim()
  if (data.kind !== undefined) update.kind = data.kind
  if (data.fte_default !== undefined) update.fte_default = data.fte_default
  if (data.availability_default !== undefined)
    update.availability_default = data.availability_default
  if (data.is_active !== undefined) update.is_active = data.is_active
  if (data.linked_user_id !== undefined)
    update.linked_user_id = data.linked_user_id ?? null

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
