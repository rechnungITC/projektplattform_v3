import { NextResponse } from "next/server"
import { z } from "zod"

import { OPEN_ITEM_STATUSES } from "@/types/open-item"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../_lib/route-helpers"

// PROJ-20 — collection endpoint for open items.
// GET  /api/projects/[id]/open-items?status=open|in_clarification|...
// POST /api/projects/[id]/open-items

const createSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().max(5000).optional().nullable(),
  status: z
    .enum(["open", "in_clarification", "closed"] as const)
    .default("open"),
  contact: z.string().max(255).optional().nullable(),
  contact_stakeholder_id: z.string().uuid().optional().nullable(),
})

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

  const data = parsed.data
  const insertPayload = {
    tenant_id: access.project.tenant_id,
    project_id: projectId,
    title: data.title.trim(),
    description: data.description?.trim() || null,
    status: data.status,
    contact: data.contact?.trim() || null,
    contact_stakeholder_id: data.contact_stakeholder_id ?? null,
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
