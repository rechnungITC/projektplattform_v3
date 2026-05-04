import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  budgetCategoryCreateSchema as createSchema,
  normalizeBudgetCategoryPayload,
} from "./_schema"

// GET /api/projects/[id]/budget/categories
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

  const { data, error } = await supabase
    .from("budget_categories")
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ categories: data ?? [] })
}

// POST /api/projects/[id]/budget/categories
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

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("tenant_id")
    .eq("id", projectId)
    .maybeSingle()
  if (projErr) return apiError("internal_error", projErr.message, 500)
  if (!project) return apiError("not_found", "Project not found.", 404)

  const moduleDenial = await requireModuleActive(
    supabase,
    project.tenant_id,
    "budget",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  // Spread-Pattern: schema is the single source of truth. position default
  // is applied via the spread fallback below.
  const insertPayload = {
    ...normalizeBudgetCategoryPayload(parsed.data),
    position: parsed.data.position ?? 0,
    tenant_id: project.tenant_id,
    project_id: projectId,
    created_by: userId,
  }

  const { data, error } = await supabase
    .from("budget_categories")
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Editor role required.", 403)
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ category: data }, { status: 201 })
}
