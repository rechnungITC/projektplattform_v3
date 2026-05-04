import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  budgetCategoryPatchSchema as patchSchema,
  normalizeBudgetCategoryPayload,
} from "../_schema"

function validateIds(projectId: string, categoryId: string) {
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(categoryId).success) {
    return apiError("validation_error", "Invalid category id.", 400, "cid")
  }
  return null
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; cid: string }> }
) {
  const { id: projectId, cid: categoryId } = await context.params
  const idErr = validateIds(projectId, categoryId)
  if (idErr) return idErr

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be JSON.", 400)
  }
  const parsed = patchSchema.safeParse(body)
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
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  // Spread-Pattern: schema is the single source of truth.
  const update = normalizeBudgetCategoryPayload(parsed.data)

  const { data, error } = await supabase
    .from("budget_categories")
    .update(update)
    .eq("id", categoryId)
    .eq("project_id", projectId)
    .select()
    .maybeSingle()

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Editor role required.", 403)
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    return apiError("update_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Category not found.", 404)
  return NextResponse.json({ category: data })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; cid: string }> }
) {
  const { id: projectId, cid: categoryId } = await context.params
  const idErr = validateIds(projectId, categoryId)
  if (idErr) return idErr

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
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  // Edge case: category cannot be deleted if any active items still reference
  // it. The DB has ON DELETE CASCADE on items, but per spec we soft-block here
  // to prevent accidental wipe of a populated category.
  const { count: activeItemCount, error: itemErr } = await supabase
    .from("budget_items")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId)
    .eq("is_active", true)
  if (itemErr) return apiError("internal_error", itemErr.message, 500)
  if ((activeItemCount ?? 0) > 0) {
    return apiError(
      "category_not_empty",
      "Kategorie enthält noch aktive Posten — bitte zuerst Posten deaktivieren.",
      409
    )
  }

  const { data, error } = await supabase
    .from("budget_categories")
    .delete()
    .eq("id", categoryId)
    .eq("project_id", projectId)
    .select("id")
    .maybeSingle()

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Editor role required.", 403)
    return apiError("delete_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Category not found.", 404)
  return new NextResponse(null, { status: 204 })
}
