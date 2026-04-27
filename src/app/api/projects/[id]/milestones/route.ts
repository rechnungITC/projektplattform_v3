import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")

const createSchema = z.object({
  phase_id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(255),
  description: z.string().max(5000).optional().nullable(),
  target_date: isoDate,
  status: z.enum(["planned", "achieved", "missed", "cancelled"]).default("planned"),
})

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  let body: unknown
  try { body = await request.json() } catch { return apiError("invalid_body", "Body must be JSON.", 400) }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    const f = parsed.error.issues[0]
    return apiError("validation_error", f?.message ?? "Invalid body.", 400, f?.path?.[0]?.toString())
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: project, error: projErr } = await supabase
    .from("projects").select("tenant_id").eq("id", projectId).maybeSingle()
  if (projErr) return apiError("internal_error", projErr.message, 500)
  if (!project) return apiError("not_found", "Project not found.", 404)

  const { data, error } = await supabase
    .from("milestones").insert({
      tenant_id: project.tenant_id,
      project_id: projectId,
      phase_id: parsed.data.phase_id ?? null,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      target_date: parsed.data.target_date,
      status: parsed.data.status,
      created_by: userId,
    }).select().single()

  if (error) {
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ milestone: data }, { status: 201 })
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const url = new URL(request.url)
  const phaseFilter = url.searchParams.get("phase_id")
  const statusFilter = url.searchParams.get("status")
  const overdueOnly = url.searchParams.get("overdue") === "true"

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  let query = supabase
    .from("milestones").select("*").eq("project_id", projectId).eq("is_deleted", false)
    .order("target_date", { ascending: true })

  if (phaseFilter && phaseFilter !== "__none__") query = query.eq("phase_id", phaseFilter)
  if (phaseFilter === "__none__") query = query.is("phase_id", null)
  if (statusFilter) query = query.eq("status", statusFilter)
  if (overdueOnly) {
    const today = new Date().toISOString().slice(0, 10)
    query = query.eq("status", "planned").lt("target_date", today)
  }

  const { data, error } = await query
  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ milestones: data ?? [] })
}
