import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"
import { VENDOR_DOCUMENT_KINDS } from "@/types/vendor"

import { apiError } from "../../../_lib/route-helpers"
import { vendorTenantContext } from "../../_lib/tenant"

// PROJ-15 — vendor documents (metadata + external_url, NO upload).
// GET  /api/vendors/[vid]/documents
// POST /api/vendors/[vid]/documents  (admin/editor)

const SELECT_COLUMNS =
  "id, tenant_id, vendor_id, kind, title, external_url, document_date, note, created_by, created_at"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")

const createSchema = z.object({
  kind: z.enum(VENDOR_DOCUMENT_KINDS as unknown as [string, ...string[]]),
  title: z.string().trim().min(1).max(200),
  external_url: z
    .string()
    .trim()
    .url()
    .startsWith("https://", "URL muss HTTPS sein")
    .max(2000),
  document_date: isoDate.optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
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
    .from("vendor_documents")
    .select(SELECT_COLUMNS)
    .eq("vendor_id", vid)
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ documents: data ?? [] })
}

export async function POST(request: Request, ctx: Ctx) {
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

  const auth = await vendorTenantContext()
  if ("error" in auth) return auth.error

  const moduleDenial = await requireModuleActive(
    auth.supabase,
    auth.tenantId,
    "vendor",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  const { data: vendor, error: vErr } = await auth.supabase
    .from("vendors")
    .select("id")
    .eq("id", vid)
    .maybeSingle()
  if (vErr) return apiError("read_failed", vErr.message, 500)
  if (!vendor) return apiError("not_found", "Vendor not found.", 404)

  const data = parsed.data
  const { data: row, error } = await auth.supabase
    .from("vendor_documents")
    .insert({
      tenant_id: auth.tenantId,
      vendor_id: vid,
      kind: data.kind,
      title: data.title.trim(),
      external_url: data.external_url.trim(),
      document_date: data.document_date ?? null,
      note: data.note?.trim() || null,
      created_by: auth.userId,
    })
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Tenant admin or editor role required.", 403)
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("create_failed", error.message, 500)
  }
  return NextResponse.json({ document: row }, { status: 201 })
}
