import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import { requireModuleActive } from "@/lib/tenant-settings/server"
import type { VendorInvoice, VendorInvoiceWithBookings } from "@/types/budget"

import { invoiceCreateSchema as createSchema, normalizeInvoicePayload } from "./_schema"

// GET /api/vendors/[vid]/invoices
//   Lists all invoices of a vendor. Joins booked-amount aggregation per invoice.
export async function GET(
  _request: Request,
  context: { params: Promise<{ vid: string }> }
) {
  const { vid: vendorId } = await context.params
  if (!z.string().uuid().safeParse(vendorId).success) {
    return apiError("validation_error", "Invalid vendor id.", 400, "vid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: vendorRow } = await supabase
    .from("vendors")
    .select("tenant_id")
    .eq("id", vendorId)
    .maybeSingle()
  if (!vendorRow) return apiError("not_found", "Vendor not found.", 404)
  const moduleDenial = await requireModuleActive(
    supabase,
    vendorRow.tenant_id,
    "budget",
    { intent: "read" }
  )
  if (moduleDenial) return moduleDenial

  const { data: invoices, error: invErr } = await supabase
    .from("vendor_invoices")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("invoice_date", { ascending: false })
    .limit(500)
  if (invErr) return apiError("list_failed", invErr.message, 500)
  if (!invoices || invoices.length === 0) {
    return NextResponse.json({ invoices: [] })
  }

  const invoiceIds = invoices.map((i) => (i as VendorInvoice).id)

  // Aggregate booked-amount per invoice from postings.
  const { data: postings, error: postErr } = await supabase
    .from("budget_postings")
    .select("source_ref_id, amount, kind, currency")
    .in("source_ref_id", invoiceIds)
    .eq("source", "vendor_invoice")
  if (postErr) return apiError("list_failed", postErr.message, 500)

  type PostRow = { source_ref_id: string; amount: number; kind: string; currency: string }
  const bookedByInvoice = new Map<string, number>()
  for (const p of (postings ?? []) as unknown as PostRow[]) {
    if (!p.source_ref_id) continue
    const current = bookedByInvoice.get(p.source_ref_id) ?? 0
    if (p.kind === "actual" || p.kind === "reversal") {
      bookedByInvoice.set(p.source_ref_id, current + Number(p.amount))
    }
  }

  const enriched: VendorInvoiceWithBookings[] = (
    invoices as unknown as VendorInvoice[]
  ).map((inv) => ({
    ...inv,
    booked_amount: bookedByInvoice.get(inv.id) ?? 0,
  }))

  return NextResponse.json({ invoices: enriched })
}

// POST /api/vendors/[vid]/invoices
export async function POST(
  request: Request,
  context: { params: Promise<{ vid: string }> }
) {
  const { vid: vendorId } = await context.params
  if (!z.string().uuid().safeParse(vendorId).success) {
    return apiError("validation_error", "Invalid vendor id.", 400, "vid")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be JSON.", 400)
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    const f = parsed.error.issues[0]
    return apiError(
      "validation_error",
      f?.message ?? "Invalid body.",
      400,
      f?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // Resolve tenant_id from the vendor (RLS protects cross-tenant access).
  const { data: vendor, error: vendorErr } = await supabase
    .from("vendors")
    .select("tenant_id")
    .eq("id", vendorId)
    .maybeSingle()
  if (vendorErr) return apiError("internal_error", vendorErr.message, 500)
  if (!vendor) return apiError("not_found", "Vendor not found.", 404)

  const moduleDenial = await requireModuleActive(
    supabase,
    vendor.tenant_id,
    "budget",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  // If a project_id is provided, defense-in-depth check that it belongs to
  // the same tenant.
  if (parsed.data.project_id) {
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("tenant_id")
      .eq("id", parsed.data.project_id)
      .maybeSingle()
    if (projErr) return apiError("internal_error", projErr.message, 500)
    if (!project || project.tenant_id !== vendor.tenant_id) {
      return apiError(
        "invalid_reference",
        "Project not found or in different tenant.",
        422,
        "project_id"
      )
    }
  }

  const { data, error } = await supabase
    .from("vendor_invoices")
    .insert({
      ...normalizeInvoicePayload(parsed.data),
      tenant_id: vendor.tenant_id,
      vendor_id: vendorId,
      created_by: userId,
    })
    .select()
    .single()

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Editor role required.", 403)
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ invoice: data }, { status: 201 })
}
