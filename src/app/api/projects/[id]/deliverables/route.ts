import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { createDeliverableSchema, DELIVERABLE_SELECT } from "./_schema"

// PROJ-104 — Deliverables for a project.
// GET  → list (project members; RLS + need-to-know). POST → create (lead/admin).

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
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("deliverables")
    .select(DELIVERABLE_SELECT)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ deliverables: data ?? [] })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(
    supabase,
    projectId,
    userId,
    "manage_members"
  )
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = createDeliverableSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { data, error } = await supabase
    .from("deliverables")
    .insert({
      tenant_id: access.project.tenant_id,
      project_id: projectId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      phase_id: parsed.data.phase_id ?? null,
      workstream_id: parsed.data.workstream_id ?? null,
      responsible_user_id: parsed.data.responsible_user_id ?? null,
      due_date: parsed.data.due_date ?? null,
      status: parsed.data.status ?? "planned",
      confidentiality_level: parsed.data.confidentiality_level ?? "standard",
      sort_order: parsed.data.sort_order ?? 0,
      created_by: userId,
    })
    .select(DELIVERABLE_SELECT)
    .single()

  if (error) {
    if (error.code === "23514") {
      return apiError(
        "constraint_violation",
        "Ein Deliverable braucht mindestens eine Phase oder einen Workstream.",
        422
      )
    }
    if (error.code === "23503") {
      return apiError("validation_error", "Unknown phase, workstream or user.", 400)
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ deliverable: data }, { status: 201 })
}
