import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { setWorkstreamPhasesSchema } from "../../_schema"

// PROJ-102 — set the M:N phase assignment of a workstream (AC1: one or more
// phases). PUT replaces the full set. Applied as a diff (insert missing, delete
// extra) so a partial failure can't wipe the whole assignment. RLS enforces
// authz (lead/admin + need-to-know via the parent workstream).

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string; wsid: string }> }
) {
  const { id: projectId, wsid } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(wsid).success) {
    return apiError("validation_error", "Invalid workstream id.", 400, "wsid")
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
  const parsed = setWorkstreamPhasesSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  // Confirm the workstream exists in this project (and is caller-visible via RLS).
  const { data: ws, error: wsErr } = await supabase
    .from("workstreams")
    .select("id, tenant_id")
    .eq("id", wsid)
    .eq("project_id", projectId)
    .maybeSingle()
  if (wsErr) return apiError("internal_error", wsErr.message, 500)
  if (!ws) return apiError("not_found", "Workstream not found.", 404)

  const desired = new Set(parsed.data.phase_ids)

  const { data: existingRows, error: exErr } = await supabase
    .from("workstream_phases")
    .select("phase_id")
    .eq("workstream_id", wsid)
  if (exErr) return apiError("internal_error", exErr.message, 500)
  const existing = new Set((existingRows ?? []).map((r) => r.phase_id as string))

  const toAdd = [...desired].filter((p) => !existing.has(p))
  const toRemove = [...existing].filter((p) => !desired.has(p))

  if (toAdd.length > 0) {
    const { error: addErr } = await supabase.from("workstream_phases").insert(
      toAdd.map((phase_id) => ({
        tenant_id: ws.tenant_id,
        workstream_id: wsid,
        phase_id,
        created_by: userId,
      }))
    )
    if (addErr) {
      if (addErr.code === "23503") {
        return apiError("validation_error", "Unknown phase.", 400, "phase_ids")
      }
      if (addErr.code === "42501") {
        return apiError("forbidden", "Not allowed.", 403)
      }
      return apiError("update_failed", addErr.message, 500)
    }
  }

  if (toRemove.length > 0) {
    const { error: delErr } = await supabase
      .from("workstream_phases")
      .delete()
      .eq("workstream_id", wsid)
      .in("phase_id", toRemove)
    if (delErr) return apiError("update_failed", delErr.message, 500)
  }

  return NextResponse.json({ phase_ids: [...desired] })
}
