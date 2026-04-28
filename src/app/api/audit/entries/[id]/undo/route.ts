import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

// PROJ-10 — POST /api/audit/entries/[id]/undo
// Selectively rolls back one field on one entity using the SECURITY DEFINER
// `audit_undo_field` RPC. Refuses if the field has been further modified
// after the targeted audit entry (no silent stale rollback).

interface Ctx {
  params: Promise<{ id: string }>
}

export async function POST(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid audit id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  // Look up the audit entry (RLS gates visibility — non-readers get not_found).
  const { data: entry, error: readErr } = await supabase
    .from("audit_log_entries")
    .select("id, entity_type, entity_id, field_name")
    .eq("id", id)
    .maybeSingle()
  if (readErr) {
    return apiError("read_failed", readErr.message, 500)
  }
  if (!entry) {
    return apiError("not_found", "Audit entry not found.", 404)
  }

  // Look up the entity to derive project_id for the access check.
  let projectId: string | null = null
  if (entry.entity_type === "projects") {
    projectId = entry.entity_id
  } else {
    const { data: row, error: lookupErr } = await supabase
      .from(entry.entity_type)
      .select("project_id")
      .eq("id", entry.entity_id)
      .maybeSingle()
    if (lookupErr) {
      return apiError("read_failed", lookupErr.message, 500)
    }
    projectId = (row as { project_id: string } | null)?.project_id ?? null
  }
  if (!projectId) {
    return apiError("not_found", "Target entity not found.", 404)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const { data: result, error: rpcErr } = await supabase
    .rpc("audit_undo_field", { p_audit_id: id })
    .single<{
      success: boolean
      message: string
      entity_id: string | null
    }>()

  if (rpcErr) {
    return apiError("undo_failed", rpcErr.message, 500)
  }
  if (!result?.success) {
    if (result?.message === "field_modified_after") {
      return apiError(
        "conflict",
        "Field was further modified after this audit entry; refusing stale rollback.",
        409
      )
    }
    return apiError("undo_failed", result?.message ?? "unknown", 422)
  }

  return NextResponse.json({ ok: true, entity_id: result.entity_id })
}
