import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import { requireModuleActive } from "@/lib/tenant-settings/server"
import type { BudgetItem, BudgetItemTotals, BudgetItemWithTotals } from "@/types/budget"

import {
  budgetItemCreateSchema as createSchema,
  normalizeBudgetItemPayload,
} from "./_schema"

// GET /api/projects/[id]/budget/items
//   Returns the full list of items joined with their aggregated totals
//   from `budget_item_totals`. UI renders the table from this single
//   round-trip.
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: proj } = await supabase
    .from("projects")
    .select("tenant_id")
    .eq("id", projectId)
    .maybeSingle()
  if (!proj) return apiError("not_found", "Project not found.", 404)
  const moduleDenial = await requireModuleActive(
    supabase,
    proj.tenant_id,
    "budget",
    { intent: "read" }
  )
  if (moduleDenial) return moduleDenial

  const [itemsRes, totalsRes] = await Promise.all([
    supabase
      .from("budget_items")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(500),
    supabase
      .from("budget_item_totals")
      .select("*")
      .eq("project_id", projectId)
      .limit(500),
  ])
  if (itemsRes.error) return apiError("list_failed", itemsRes.error.message, 500)
  if (totalsRes.error) return apiError("list_failed", totalsRes.error.message, 500)

  const totalsById = new Map(
    ((totalsRes.data ?? []) as unknown as BudgetItemTotals[]).map((t) => [
      t.item_id,
      t,
    ])
  )

  const items: BudgetItemWithTotals[] = (
    (itemsRes.data ?? []) as unknown as BudgetItem[]
  ).map((i) => {
    const t = totalsById.get(i.id)
    return {
      ...i,
      actual_amount: t?.actual_amount ?? 0,
      reservation_amount: t?.reservation_amount ?? 0,
      multi_currency_postings_count: t?.multi_currency_postings_count ?? 0,
      traffic_light_state: t?.traffic_light_state ?? "green",
    }
  })

  return NextResponse.json({ items })
}

// POST /api/projects/[id]/budget/items
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
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

  // Verify the category belongs to this project (defense-in-depth on top of FK)
  const { data: cat, error: catErr } = await supabase
    .from("budget_categories")
    .select("id, project_id, tenant_id")
    .eq("id", parsed.data.category_id)
    .maybeSingle()
  if (catErr) return apiError("internal_error", catErr.message, 500)
  if (!cat) return apiError("not_found", "Category not found.", 404)
  if (cat.project_id !== projectId) {
    return apiError(
      "invalid_reference",
      "Category does not belong to this project.",
      422,
      "category_id"
    )
  }

  const moduleDenial = await requireModuleActive(
    supabase,
    cat.tenant_id,
    "budget",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  // Spread-Pattern: schema is the single source of truth. Server-side
  // defaults for position + is_active are applied alongside the spread.
  const insertPayload = {
    ...normalizeBudgetItemPayload(parsed.data),
    position: parsed.data.position ?? 0,
    is_active: parsed.data.is_active ?? true,
    tenant_id: cat.tenant_id,
    project_id: projectId,
    created_by: userId,
  }

  const { data, error } = await supabase
    .from("budget_items")
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Editor role required.", 403)
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ item: data }, { status: 201 })
}
