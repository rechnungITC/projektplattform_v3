import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"

// PROJ-11 — work-item allocation join.
// GET  /api/projects/[id]/work-items/[wid]/resources
// POST /api/projects/[id]/work-items/[wid]/resources

const SELECT_COLUMNS =
  "id, tenant_id, project_id, work_item_id, resource_id, allocation_pct, created_by, created_at, updated_at"

const createSchema = z.object({
  resource_id: z.string().uuid(),
  allocation_pct: z.number().min(0).max(200),
})

interface Ctx {
  params: Promise<{ id: string; wid: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id: projectId, wid } = await ctx.params
  if (!z.string().uuid().safeParse(wid).success) {
    return apiError("validation_error", "Invalid work item id.", 400, "wid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "resources",
    { intent: "read" }
  )
  if (moduleDenial) return moduleDenial

  const { data, error } = await supabase
    .from("work_item_resources")
    .select(SELECT_COLUMNS)
    .eq("project_id", projectId)
    .eq("work_item_id", wid)
    .order("created_at", { ascending: true })
    .limit(100)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ allocations: data ?? [] })
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId, wid } = await ctx.params
  if (!z.string().uuid().safeParse(wid).success) {
    return apiError("validation_error", "Invalid work item id.", 400, "wid")
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

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "resources",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  // Verify the work item belongs to this project (RLS would also catch
  // this, but a clean 404 is better UX than a 42501).
  const { data: wi, error: wiErr } = await supabase
    .from("work_items")
    .select("id, project_id")
    .eq("id", wid)
    .eq("project_id", projectId)
    .maybeSingle()
  if (wiErr) return apiError("read_failed", wiErr.message, 500)
  if (!wi) return apiError("not_found", "Work item not found.", 404)

  const insertPayload = {
    tenant_id: access.project.tenant_id,
    project_id: projectId,
    work_item_id: wid,
    resource_id: parsed.data.resource_id,
    allocation_pct: parsed.data.allocation_pct,
    created_by: userId,
  }

  const { data: row, error } = await supabase
    .from("work_item_resources")
    .insert(insertPayload)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Editor or lead role required.", 403)
    }
    if (error.code === "23505") {
      return apiError(
        "duplicate",
        "This resource is already allocated to this work item.",
        409
      )
    }
    if (error.code === "23503") {
      return apiError(
        "invalid_reference",
        "Resource not found in this tenant.",
        422
      )
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("create_failed", error.message, 500)
  }
  return NextResponse.json({ allocation: row }, { status: 201 })
}
