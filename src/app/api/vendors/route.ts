import { NextResponse } from "next/server"

import { requireModuleActive } from "@/lib/tenant-settings/server"
import { VENDOR_STATUSES } from "@/types/vendor"

import { apiError } from "../_lib/route-helpers"

import { vendorCreateSchema as createSchema, normalizeVendorPayload } from "./_schema"
import { vendorTenantContext } from "./_lib/tenant"

// PROJ-15 — vendor master data collection.
// GET  /api/vendors?status=&search=  → list with on-the-fly avg-score
// POST /api/vendors                  → create (admin/editor)

const SELECT_COLUMNS =
  "id, tenant_id, name, category, primary_contact_email, website, status, created_by, created_at, updated_at"

interface VendorRow {
  id: string
  tenant_id: string
  name: string
  category: string | null
  primary_contact_email: string | null
  website: string | null
  status: string
  created_by: string
  created_at: string
  updated_at: string
}

interface EvalAggRow {
  vendor_id: string
  score: number
}
interface AssignmentAggRow {
  vendor_id: string
}

export async function GET(request: Request) {
  const ctx = await vendorTenantContext()
  if ("error" in ctx) return ctx.error

  const moduleDenial = await requireModuleActive(
    ctx.supabase,
    ctx.tenantId,
    "vendor",
    { intent: "read" }
  )
  if (moduleDenial) return moduleDenial

  const url = new URL(request.url)
  const statusFilter = url.searchParams.get("status")
  const search = url.searchParams.get("search")

  let query = ctx.supabase
    .from("vendors")
    .select(SELECT_COLUMNS)
    .eq("tenant_id", ctx.tenantId)
    .order("name", { ascending: true })
    .limit(500)

  if (statusFilter && (VENDOR_STATUSES as readonly string[]).includes(statusFilter)) {
    query = query.eq("status", statusFilter)
  }
  if (search && search.trim().length > 0) {
    query = query.ilike("name", `%${search.trim()}%`)
  }

  const { data: vendors, error } = await query
  if (error) return apiError("list_failed", error.message, 500)

  const vendorRows = (vendors ?? []) as VendorRow[]
  if (vendorRows.length === 0) {
    return NextResponse.json({ vendors: [] })
  }

  const ids = vendorRows.map((v) => v.id)

  // On-the-fly avg-score across vendor_evaluations + assignment count.
  // Two cheap queries, then merge in JS.
  const { data: evals } = await ctx.supabase
    .from("vendor_evaluations")
    .select("vendor_id, score")
    .in("vendor_id", ids)
  const { data: assigns } = await ctx.supabase
    .from("vendor_project_assignments")
    .select("vendor_id")
    .in("vendor_id", ids)

  const scoreSum = new Map<string, { total: number; count: number }>()
  for (const r of (evals ?? []) as EvalAggRow[]) {
    const cur = scoreSum.get(r.vendor_id) ?? { total: 0, count: 0 }
    cur.total += r.score
    cur.count += 1
    scoreSum.set(r.vendor_id, cur)
  }
  const assignCount = new Map<string, number>()
  for (const r of (assigns ?? []) as AssignmentAggRow[]) {
    assignCount.set(r.vendor_id, (assignCount.get(r.vendor_id) ?? 0) + 1)
  }

  const enriched = vendorRows.map((v) => {
    const s = scoreSum.get(v.id)
    return {
      ...v,
      avg_score: s ? Number((s.total / s.count).toFixed(2)) : null,
      evaluation_count: s?.count ?? 0,
      assignment_count: assignCount.get(v.id) ?? 0,
    }
  })

  return NextResponse.json({ vendors: enriched })
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

  const ctx = await vendorTenantContext()
  if ("error" in ctx) return ctx.error

  const moduleDenial = await requireModuleActive(
    ctx.supabase,
    ctx.tenantId,
    "vendor",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  // Spread-Pattern: schema is the single source of truth.
  const insertPayload = {
    ...normalizeVendorPayload(parsed.data),
    tenant_id: ctx.tenantId,
    created_by: ctx.userId,
  }

  const { data: row, error } = await ctx.supabase
    .from("vendors")
    .insert(insertPayload)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Tenant admin or editor role required.",
        403
      )
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("create_failed", error.message, 500)
  }
  return NextResponse.json({ vendor: row }, { status: 201 })
}
