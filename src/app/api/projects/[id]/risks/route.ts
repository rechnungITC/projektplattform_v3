import { NextResponse } from "next/server"
import { z } from "zod"

import { RISK_STATUSES } from "@/types/risk"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../_lib/route-helpers"

// PROJ-20 — collection endpoint for project risks.
// GET  /api/projects/[id]/risks?status=open|...
// POST /api/projects/[id]/risks

const createSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().max(5000).optional().nullable(),
  probability: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  status: z
    .enum(RISK_STATUSES as unknown as [string, ...string[]])
    .default("open"),
  mitigation: z.string().max(5000).optional().nullable(),
  responsible_user_id: z.string().uuid().optional().nullable(),
})

const SELECT_COLUMNS =
  "id, tenant_id, project_id, title, description, probability, impact, score, status, mitigation, responsible_user_id, created_by, created_at, updated_at"

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
    .from("risks")
    .select(SELECT_COLUMNS)
    .eq("project_id", projectId)
    .order("score", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(500)

  if (
    statusFilter &&
    (RISK_STATUSES as readonly string[]).includes(statusFilter)
  ) {
    query = query.eq("status", statusFilter)
  }

  const { data, error } = await query
  if (error) {
    return apiError("list_failed", error.message, 500)
  }
  return NextResponse.json({ risks: data ?? [] })
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
    probability: data.probability,
    impact: data.impact,
    status: data.status,
    mitigation: data.mitigation?.trim() || null,
    responsible_user_id: data.responsible_user_id ?? null,
    created_by: userId,
  }

  const { data: row, error } = await supabase
    .from("risks")
    .insert(insertPayload)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Editor or lead role required to add risks.",
        403
      )
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ risk: row }, { status: 201 })
}
