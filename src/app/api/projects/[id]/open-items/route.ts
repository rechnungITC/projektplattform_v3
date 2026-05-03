import { NextResponse } from "next/server"

import { requireModuleActive } from "@/lib/tenant-settings/server"
import { OPEN_ITEM_STATUSES } from "@/types/open-item"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../_lib/route-helpers"
import {
  openItemCreateSchema as createSchema,
  normalizeOpenItemPayload,
} from "./_schema"

// PROJ-20 — collection endpoint for open items.
// GET  /api/projects/[id]/open-items?status=open|in_clarification|...
// POST /api/projects/[id]/open-items
//
// Schema lives in `_schema.ts` so the drift-test can introspect it.

const SELECT_COLUMNS =
  "id, tenant_id, project_id, title, description, status, contact, contact_stakeholder_id, converted_to_entity_type, converted_to_entity_id, created_by, created_at, updated_at"

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "decisions",
    { intent: "read" }
  )
  if (moduleDenial) return moduleDenial

  const url = new URL(request.url)
  const statusFilter = url.searchParams.get("status")

  let query = supabase
    .from("open_items")
    .select(SELECT_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(500)

  if (
    statusFilter &&
    (OPEN_ITEM_STATUSES as readonly string[]).includes(statusFilter)
  ) {
    query = query.eq("status", statusFilter)
  }

  const { data, error } = await query
  if (error) {
    return apiError("list_failed", error.message, 500)
  }
  return NextResponse.json({ open_items: data ?? [] })
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params

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
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "decisions",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  // Spread-Pattern: schema is the single source of truth. New schema fields
  // flow through automatically. Drift-test in route.test.ts asserts every
  // schema key reaches this payload.
  const insertPayload = {
    ...normalizeOpenItemPayload(parsed.data),
    tenant_id: access.project.tenant_id,
    project_id: projectId,
    created_by: userId,
  }

  const { data: row, error } = await supabase
    .from("open_items")
    .insert(insertPayload)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Editor or lead role required to add open items.",
        403
      )
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ open_item: row }, { status: 201 })
}
