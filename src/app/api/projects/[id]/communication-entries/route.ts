import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { createEntrySchema, ENTRY_SELECT } from "./_schema"

// PROJ-118 — Kommunikationsmatrix entries per project.
//
// GET  /api/projects/[id]/communication-entries — list entries (RLS +
//      need-to-know confidentiality gate scope rows).
// POST /api/projects/[id]/communication-entries — create via
//      create_communication_entry RPC (manager + clearance enforced server-side).

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
    .from("communication_matrix_entries")
    .select(ENTRY_SELECT)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500)
  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ entries: data ?? [] })
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

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = createEntrySchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }
  const d = parsed.data

  const { data, error } = await supabase.rpc("create_communication_entry", {
    p_project_id: projectId,
    p_target_group_key: d.target_group_key,
    p_message: d.message ?? null,
    p_channel: d.channel ?? null,
    p_planned_date: d.planned_date ?? null,
    p_responsible_user_id: d.responsible_user_id ?? null,
    p_approver_user_id: d.approver_user_id ?? null,
    p_confidentiality_level: d.confidentiality_level ?? "standard",
    p_target_group_label: d.target_group_label ?? null,
    p_template_id: d.template_id ?? null,
    p_phase_id: d.phase_id ?? null,
    p_stage_gate_id: d.stage_gate_id ?? null,
    p_work_item_id: d.work_item_id ?? null,
  })

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Not authorized to create this entry.", 403)
    }
    if (error.code === "P0002") {
      return apiError("not_found", "Project not found.", 404)
    }
    if (error.code === "23503" || error.code === "22023" || error.code === "23514") {
      return apiError("validation_error", error.message, 422)
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ entry: data }, { status: 201 })
}
