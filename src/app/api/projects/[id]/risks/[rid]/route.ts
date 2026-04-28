import { NextResponse } from "next/server"
import { z } from "zod"

import { RISK_STATUSES } from "@/types/risk"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

// PROJ-20 — single-risk endpoints.
// GET    /api/projects/[id]/risks/[rid]
// PATCH  /api/projects/[id]/risks/[rid]
// DELETE /api/projects/[id]/risks/[rid]

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(5000).optional().nullable(),
    probability: z.number().int().min(1).max(5).optional(),
    impact: z.number().int().min(1).max(5).optional(),
    status: z
      .enum(RISK_STATUSES as unknown as [string, ...string[]])
      .optional(),
    mitigation: z.string().max(5000).optional().nullable(),
    responsible_user_id: z.string().uuid().optional().nullable(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "At least one field must be provided.",
  })

const SELECT_COLUMNS =
  "id, tenant_id, project_id, title, description, probability, impact, score, status, mitigation, responsible_user_id, created_by, created_at, updated_at"

interface Ctx {
  params: Promise<{ id: string; rid: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id: projectId, rid } = await ctx.params
  if (!z.string().uuid().safeParse(rid).success) {
    return apiError("validation_error", "Invalid risk id.", 400, "rid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("risks")
    .select(SELECT_COLUMNS)
    .eq("project_id", projectId)
    .eq("id", rid)
    .maybeSingle()

  if (error) {
    return apiError("read_failed", error.message, 500)
  }
  if (!data) {
    return apiError("not_found", "Risk not found.", 404)
  }
  return NextResponse.json({ risk: data })
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id: projectId, rid } = await ctx.params
  if (!z.string().uuid().safeParse(rid).success) {
    return apiError("validation_error", "Invalid risk id.", 400, "rid")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = patchSchema.safeParse(body)
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
  const update: Record<string, unknown> = {}
  if (data.title !== undefined) update.title = data.title.trim()
  if (data.description !== undefined)
    update.description = data.description?.trim() || null
  if (data.probability !== undefined) update.probability = data.probability
  if (data.impact !== undefined) update.impact = data.impact
  if (data.status !== undefined) update.status = data.status
  if (data.mitigation !== undefined)
    update.mitigation = data.mitigation?.trim() || null
  if (data.responsible_user_id !== undefined)
    update.responsible_user_id = data.responsible_user_id ?? null

  const { data: row, error } = await supabase
    .from("risks")
    .update(update)
    .eq("project_id", projectId)
    .eq("id", rid)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") {
      return apiError("not_found", "Risk not found.", 404)
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("update_failed", error.message, 500)
  }
  return NextResponse.json({ risk: row })
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id: projectId, rid } = await ctx.params
  if (!z.string().uuid().safeParse(rid).success) {
    return apiError("validation_error", "Invalid risk id.", 400, "rid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const { error } = await supabase
    .from("risks")
    .delete()
    .eq("project_id", projectId)
    .eq("id", rid)

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Lead or admin required to delete risks.",
        403
      )
    }
    return apiError("delete_failed", error.message, 500)
  }
  return new NextResponse(null, { status: 204 })
}
