import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"
import { VENDOR_STATUSES } from "@/types/vendor"

import { apiError } from "../../_lib/route-helpers"
import { vendorTenantContext } from "../_lib/tenant"

// PROJ-15 — single vendor endpoints.
// GET    /api/vendors/[vid]
// PATCH  /api/vendors/[vid]   (admin/editor)
// DELETE /api/vendors/[vid]   (admin only)

const SELECT_COLUMNS =
  "id, tenant_id, name, category, primary_contact_email, website, status, created_by, created_at, updated_at"

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    category: z.string().trim().max(120).optional().nullable(),
    primary_contact_email: z
      .string()
      .trim()
      .email()
      .max(320)
      .optional()
      .nullable(),
    website: z
      .string()
      .trim()
      .url()
      .startsWith("https://", "Website muss HTTPS sein")
      .max(2000)
      .optional()
      .nullable(),
    status: z
      .enum(VENDOR_STATUSES as unknown as [string, ...string[]])
      .optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "At least one field must be provided.",
  })

interface Ctx {
  params: Promise<{ vid: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { vid } = await ctx.params
  if (!z.string().uuid().safeParse(vid).success) {
    return apiError("validation_error", "Invalid vendor id.", 400, "vid")
  }

  const auth = await vendorTenantContext()
  if ("error" in auth) return auth.error

  const moduleDenial = await requireModuleActive(
    auth.supabase,
    auth.tenantId,
    "vendor",
    { intent: "read" }
  )
  if (moduleDenial) return moduleDenial

  const { data, error } = await auth.supabase
    .from("vendors")
    .select(SELECT_COLUMNS)
    .eq("id", vid)
    .maybeSingle()

  if (error) return apiError("read_failed", error.message, 500)
  if (!data) return apiError("not_found", "Vendor not found.", 404)
  return NextResponse.json({ vendor: data })
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { vid } = await ctx.params
  if (!z.string().uuid().safeParse(vid).success) {
    return apiError("validation_error", "Invalid vendor id.", 400, "vid")
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

  const auth = await vendorTenantContext()
  if ("error" in auth) return auth.error

  const moduleDenial = await requireModuleActive(
    auth.supabase,
    auth.tenantId,
    "vendor",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  const data = parsed.data
  const update: Record<string, unknown> = {}
  if (data.name !== undefined) update.name = data.name.trim()
  if (data.category !== undefined) update.category = data.category?.trim() || null
  if (data.primary_contact_email !== undefined)
    update.primary_contact_email = data.primary_contact_email?.trim() || null
  if (data.website !== undefined) update.website = data.website?.trim() || null
  if (data.status !== undefined) update.status = data.status

  const { data: row, error } = await auth.supabase
    .from("vendors")
    .update(update)
    .eq("id", vid)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") {
      return apiError("not_found", "Vendor not found.", 404)
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("update_failed", error.message, 500)
  }
  return NextResponse.json({ vendor: row })
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { vid } = await ctx.params
  if (!z.string().uuid().safeParse(vid).success) {
    return apiError("validation_error", "Invalid vendor id.", 400, "vid")
  }

  const auth = await vendorTenantContext()
  if ("error" in auth) return auth.error

  const moduleDenial = await requireModuleActive(
    auth.supabase,
    auth.tenantId,
    "vendor",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  const { error } = await auth.supabase
    .from("vendors")
    .delete()
    .eq("id", vid)

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Tenant admin role required.", 403)
    }
    return apiError("delete_failed", error.message, 500)
  }
  return new NextResponse(null, { status: 204 })
}
