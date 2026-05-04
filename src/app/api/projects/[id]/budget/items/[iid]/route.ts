import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  budgetItemPatchSchema as patchSchema,
  normalizeBudgetItemPayload,
} from "../_schema"

function validateIds(projectId: string, itemId: string) {
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(itemId).success) {
    return apiError("validation_error", "Invalid item id.", 400, "iid")
  }
  return null
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; iid: string }> }
) {
  const { id: projectId, iid: itemId } = await context.params
  const idErr = validateIds(projectId, itemId)
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

  // If category_id is changing, verify the new category is in the same project
  if (parsed.data.category_id) {
    const { data: cat } = await supabase
      .from("budget_categories")
      .select("project_id")
      .eq("id", parsed.data.category_id)
      .maybeSingle()
    if (!cat || cat.project_id !== projectId) {
      return apiError(
        "invalid_reference",
        "Category does not belong to this project.",
        422,
        "category_id"
      )
    }
  }

  // Spread-Pattern: schema is the single source of truth.
  const update = normalizeBudgetItemPayload(parsed.data)

  const { data, error } = await supabase
    .from("budget_items")
    .update(update)
    .eq("id", itemId)
    .eq("project_id", projectId)
    .select()
    .maybeSingle()

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Editor role required.", 403)
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    return apiError("update_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Item not found.", 404)
  return NextResponse.json({ item: data })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; iid: string }> }
) {
  const { id: projectId, iid: itemId } = await context.params
  const idErr = validateIds(projectId, itemId)
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

  // Edge case: items with existing postings can only be soft-deleted
  // (is_active = false). Hard delete is rejected here.
  const { count: postingCount, error: postErr } = await supabase
    .from("budget_postings")
    .select("id", { count: "exact", head: true })
    .eq("item_id", itemId)
  if (postErr) return apiError("internal_error", postErr.message, 500)
  if ((postingCount ?? 0) > 0) {
    return apiError(
      "item_has_postings",
      "Posten hat Buchungen — bitte Soft-Delete (is_active=false) verwenden.",
      409
    )
  }

  const { data, error } = await supabase
    .from("budget_items")
    .delete()
    .eq("id", itemId)
    .eq("project_id", projectId)
    .select("id")
    .maybeSingle()

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Editor role required.", 403)
    return apiError("delete_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Item not found.", 404)
  return new NextResponse(null, { status: 204 })
}
