import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { updateWorkstreamSchema, WORKSTREAM_SELECT } from "../_schema"

// PROJ-102 — single workstream management (tenant-admin or project lead).
//
// GET    /api/projects/[id]/workstreams/[wsid]  — detail (project members).
// PATCH  /api/projects/[id]/workstreams/[wsid]  — edit fields incl. rag_status
//        (RAG is a free health indicator, not a lifecycle state machine → plain
//        PATCH through the audit trigger; no transition RPC).
// DELETE /api/projects/[id]/workstreams/[wsid]  — remove.

function validateIds(projectId: string, wsid: string) {
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(wsid).success) {
    return apiError("validation_error", "Invalid workstream id.", 400, "wsid")
  }
  return null
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; wsid: string }> }
) {
  const { id: projectId, wsid } = await context.params
  const idErr = validateIds(projectId, wsid)
  if (idErr) return idErr

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("workstreams")
    .select(WORKSTREAM_SELECT)
    .eq("id", wsid)
    .eq("project_id", projectId)
    .maybeSingle()
  if (error) return apiError("internal_error", error.message, 500)
  if (!data) return apiError("not_found", "Workstream not found.", 404)

  // Phase links (M:N) alongside the detail.
  const { data: phaseRows } = await supabase
    .from("workstream_phases")
    .select("phase_id")
    .eq("workstream_id", wsid)
  const phase_ids = (phaseRows ?? []).map((r) => r.phase_id as string)

  return NextResponse.json({ workstream: data, phase_ids })
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; wsid: string }> }
) {
  const { id: projectId, wsid } = await context.params
  const idErr = validateIds(projectId, wsid)
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
  const parsed = updateWorkstreamSchema.safeParse(body)
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
    .from("workstreams")
    .update({ ...parsed.data })
    .eq("id", wsid)
    .eq("project_id", projectId)
    .select(WORKSTREAM_SELECT)
    .maybeSingle()

  if (error) {
    if (error.code === "23503") {
      return apiError("validation_error", "Unknown user.", 400)
    }
    return apiError("update_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Workstream not found.", 404)

  return NextResponse.json({ workstream: data })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; wsid: string }> }
) {
  const { id: projectId, wsid } = await context.params
  const idErr = validateIds(projectId, wsid)
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
    .from("workstreams")
    .delete()
    .eq("id", wsid)
    .eq("project_id", projectId)

  if (error) return apiError("delete_failed", error.message, 500)
  return NextResponse.json({ ok: true })
}
