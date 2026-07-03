import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { DELIVERABLE_SELECT, updateDeliverableSchema } from "../_schema"

// PROJ-104 — single deliverable. GET detail; PATCH master data (NOT status —
// use .../status which routes through transition_deliverable_status); DELETE.

function validateIds(projectId: string, did: string) {
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(did).success) {
    return apiError("validation_error", "Invalid deliverable id.", 400, "did")
  }
  return null
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; did: string }> }
) {
  const { id: projectId, did } = await context.params
  const idErr = validateIds(projectId, did)
  if (idErr) return idErr
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("deliverables")
    .select(DELIVERABLE_SELECT)
    .eq("id", did)
    .eq("project_id", projectId)
    .maybeSingle()
  if (error) return apiError("internal_error", error.message, 500)
  if (!data) return apiError("not_found", "Deliverable not found.", 404)

  const { data: docs } = await supabase
    .from("deliverable_documents")
    .select("id, deliverable_id, title, url, tag_keys, created_by, created_at")
    .eq("deliverable_id", did)
    .order("created_at", { ascending: true })

  return NextResponse.json({ deliverable: data, documents: docs ?? [] })
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; did: string }> }
) {
  const { id: projectId, did } = await context.params
  const idErr = validateIds(projectId, did)
  if (idErr) return idErr
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
  const parsed = updateDeliverableSchema.safeParse(body)
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
    .update({ ...parsed.data })
    .eq("id", did)
    .eq("project_id", projectId)
    .select(DELIVERABLE_SELECT)
    .maybeSingle()

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
    return apiError("update_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Deliverable not found.", 404)
  return NextResponse.json({ deliverable: data })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; did: string }> }
) {
  const { id: projectId, did } = await context.params
  const idErr = validateIds(projectId, did)
  if (idErr) return idErr
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(
    supabase,
    projectId,
    userId,
    "manage_members"
  )
  if (access.error) return access.error

  const { error } = await supabase
    .from("deliverables")
    .delete()
    .eq("id", did)
    .eq("project_id", projectId)
  if (error) return apiError("delete_failed", error.message, 500)
  return NextResponse.json({ ok: true })
}
