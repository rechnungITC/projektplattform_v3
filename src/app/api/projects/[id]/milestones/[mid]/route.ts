import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const updateSchema = z.object({
  phase_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  target_date: isoDate.optional(),
  actual_date: isoDate.nullable().optional(),
  status: z.enum(["planned", "achieved", "missed", "cancelled"]).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "At least one field required." })

function validateIds(projectId: string, milestoneId: string) {
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(milestoneId).success) {
    return apiError("validation_error", "Invalid milestone id.", 400, "mid")
  }
  return null
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; mid: string }> }
) {
  const { id: projectId, mid: milestoneId } = await context.params
  const idErr = validateIds(projectId, milestoneId)
  if (idErr) return idErr

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data, error } = await supabase
    .from("milestones").select("*").eq("id", milestoneId).eq("project_id", projectId).maybeSingle()
  if (error) return apiError("internal_error", error.message, 500)
  if (!data) return apiError("not_found", "Milestone not found.", 404)
  return NextResponse.json({ milestone: data })
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; mid: string }> }
) {
  const { id: projectId, mid: milestoneId } = await context.params
  const idErr = validateIds(projectId, milestoneId)
  if (idErr) return idErr

  let body: unknown
  try { body = await request.json() } catch { return apiError("invalid_body", "Body must be JSON.", 400) }
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    const f = parsed.error.issues[0]
    return apiError("validation_error", f?.message ?? "Invalid body.", 400, f?.path?.[0]?.toString())
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // Light cross-field rule: only allow actual_date when status === 'achieved'
  // (or both unchanged). We check against the merged final state.
  if (parsed.data.actual_date && parsed.data.status && parsed.data.status !== "achieved") {
    return apiError("invalid_actual_date", "actual_date is only allowed when status='achieved'.", 422, "actual_date")
  }

  const { data, error } = await supabase
    .from("milestones").update(parsed.data).eq("id", milestoneId).eq("project_id", projectId)
    .select().single()

  if (error) {
    if (error.code === "PGRST116") return apiError("not_found", "Milestone not found.", 404)
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("update_failed", error.message, 500)
  }
  return NextResponse.json({ milestone: data })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; mid: string }> }
) {
  const { id: projectId, mid: milestoneId } = await context.params
  const idErr = validateIds(projectId, milestoneId)
  if (idErr) return idErr

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { error } = await supabase
    .from("milestones").update({ is_deleted: true }).eq("id", milestoneId).eq("project_id", projectId)
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("delete_failed", error.message, 500)
  }
  return new NextResponse(null, { status: 204 })
}
