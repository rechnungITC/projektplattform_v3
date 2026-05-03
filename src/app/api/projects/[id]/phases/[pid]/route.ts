import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"

import {
  normalizePhasePayload,
  phasePatchSchema as updateSchema,
} from "../_schema"

function validateIds(projectId: string, phaseId: string) {
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(phaseId).success) {
    return apiError("validation_error", "Invalid phase id.", 400, "pid")
  }
  return null
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; pid: string }> }
) {
  const { id: projectId, pid: phaseId } = await context.params
  const idErr = validateIds(projectId, phaseId)
  if (idErr) return idErr

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data, error } = await supabase
    .from("phases").select("*").eq("id", phaseId).eq("project_id", projectId).maybeSingle()
  if (error) return apiError("internal_error", error.message, 500)
  if (!data) return apiError("not_found", "Phase not found.", 404)

  const { data: ms } = await supabase
    .from("milestones").select("*").eq("phase_id", phaseId).eq("is_deleted", false)
    .order("target_date", { ascending: true })

  return NextResponse.json({ phase: data, milestones: ms ?? [] })
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; pid: string }> }
) {
  const { id: projectId, pid: phaseId } = await context.params
  const idErr = validateIds(projectId, phaseId)
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

  // Spread-Pattern: schema is the single source of truth.
  const update = normalizePhasePayload(parsed.data)

  const { data, error } = await supabase
    .from("phases").update(update).eq("id", phaseId).eq("project_id", projectId)
    .select().single()
  if (error) {
    if (error.code === "PGRST116") return apiError("not_found", "Phase not found.", 404)
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("update_failed", error.message, 500)
  }
  return NextResponse.json({ phase: data })
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; pid: string }> }
) {
  const { id: projectId, pid: phaseId } = await context.params
  const idErr = validateIds(projectId, phaseId)
  if (idErr) return idErr

  const url = new URL(request.url)
  const force = url.searchParams.get("force") === "true"

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // Pre-check: count attached work_packages (PROJ-9 — table may not exist yet)
  if (!force) {
    try {
      const { count } = await supabase
        .from("work_items").select("id", { count: "exact", head: true })
        .eq("phase_id", phaseId).eq("kind", "work_package").eq("is_deleted", false)
      if ((count ?? 0) > 0) {
        return apiError(
          "has_attached_work_packages",
          `Phase has ${count} attached work_packages. Use ?force=true to soft-delete anyway (their phase_id will be set to NULL).`,
          409
        )
      }
    } catch {
      // PROJ-9 not yet built — treat as 0 attached
    }
  }

  // Soft delete via UPDATE (RLS allows lead/editor)
  const { error } = await supabase
    .from("phases").update({ is_deleted: true }).eq("id", phaseId).eq("project_id", projectId)
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("delete_failed", error.message, 500)
  }
  return new NextResponse(null, { status: 204 })
}
