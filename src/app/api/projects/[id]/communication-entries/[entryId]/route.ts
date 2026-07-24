import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { updateEntrySchema } from "../_schema"

// PROJ-118 — single communication matrix entry.
//
// PATCH  /api/projects/[id]/communication-entries/[entryId] — update via
//        update_communication_entry RPC.
// DELETE /api/projects/[id]/communication-entries/[entryId] — delete via
//        delete_communication_entry RPC.
// Manager + clearance enforced server-side.

type Ctx = { params: Promise<{ id: string; entryId: string }> }

async function guard(context: Ctx) {
  const { id: projectId, entryId } = await context.params
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(entryId).success
  ) {
    return { error: apiError("validation_error", "Invalid id.", 400) }
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return { error: apiError("unauthorized", "Not signed in.", 401) }
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return { error: access.error }
  return { supabase, entryId }
}

export function mapCommEntryRpcError(error: { code?: string; message: string }) {
  if (error.code === "42501") {
    return apiError("forbidden", "Not authorized for this entry.", 403)
  }
  if (error.code === "P0002") {
    return apiError("not_found", "Entry not found.", 404)
  }
  if (error.code === "23503" || error.code === "22023" || error.code === "23514") {
    return apiError("validation_error", error.message, 422)
  }
  return apiError("mutation_failed", error.message, 500)
}

export async function PATCH(request: Request, context: Ctx) {
  const g = await guard(context)
  if ("error" in g) return g.error
  const { supabase, entryId } = g

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = updateEntrySchema.safeParse(body)
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

  const { data, error } = await supabase.rpc("update_communication_entry", {
    p_entry_id: entryId,
    p_target_group_key: d.target_group_key ?? null,
    p_message: d.message ?? null,
    p_channel: d.channel ?? null,
    p_planned_date: d.planned_date ?? null,
    p_responsible_user_id: d.responsible_user_id ?? null,
    p_approver_user_id: d.approver_user_id ?? null,
    p_confidentiality_level: d.confidentiality_level ?? null,
    p_target_group_label: d.target_group_label ?? null,
    p_phase_id: d.phase_id ?? null,
    p_stage_gate_id: d.stage_gate_id ?? null,
    p_work_item_id: d.work_item_id ?? null,
  })
  if (error) return mapCommEntryRpcError(error)
  return NextResponse.json({ entry: data })
}

export async function DELETE(_request: Request, context: Ctx) {
  const g = await guard(context)
  if ("error" in g) return g.error
  const { supabase, entryId } = g

  const { error } = await supabase.rpc("delete_communication_entry", {
    p_entry_id: entryId,
  })
  if (error) return mapCommEntryRpcError(error)
  return NextResponse.json({ ok: true })
}
