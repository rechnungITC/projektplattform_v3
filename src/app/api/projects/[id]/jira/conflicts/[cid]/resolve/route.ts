/**
 * PROJ-50 — resolve a Jira sync conflict.
 *
 *   POST /api/projects/[id]/jira/conflicts/[cid]/resolve
 *     Body: { resolution: 'v3_wins' | 'jira_wins' | 'manual' }
 *
 * Editor+ on the project (RLS re-checked). Records the decision (resolved_by
 * + resolved_at, audited via the table's RLS-scoped update). For `jira_wins`
 * on a whitelisted free-text field (title/description) the Jira value is
 * applied to the work item through the same RLS + CHECK path native edits
 * hit. `status` conflicts are recorded only (α): the reverse status mapping
 * is deferred to β, so a status `jira_wins` is acknowledged without a blind
 * write of the raw Jira status name.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { INBOUND_AUTOAPPLY_FIELDS } from "@/lib/jira/inbound"

const bodySchema = z.object({
  resolution: z.enum(["v3_wins", "jira_wins", "manual"]),
})

interface Ctx {
  params: Promise<{ id: string; cid: string }>
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId, cid } = await ctx.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "id must be a UUID.", 400, "id")
  }
  if (!z.string().uuid().safeParse(cid).success) {
    return apiError("validation_error", "cid must be a UUID.", 400, "cid")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be JSON.", 400)
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    const f = parsed.error.issues[0]
    return apiError("validation_error", f?.message ?? "Invalid body.", 400, f?.path?.[0]?.toString())
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  // Load the pending conflict (RLS-scoped to the project).
  const { data: conflict, error: cErr } = await supabase
    .from("jira_sync_conflicts")
    .select("id, project_id, work_item_id, field, jira_value, resolution")
    .eq("id", cid)
    .eq("project_id", projectId)
    .maybeSingle()
  if (cErr) return apiError("internal_error", cErr.message, 500)
  if (!conflict) return apiError("not_found", "Conflict not found.", 404)
  const row = conflict as {
    id: string
    project_id: string
    work_item_id: string
    field: string
    jira_value: string | null
    resolution: string
  }
  if (row.resolution !== "pending") {
    return apiError("already_resolved", "This conflict is already resolved.", 409)
  }

  // jira_wins on a whitelisted free-text field → apply through RLS + CHECK.
  let applied = false
  if (
    parsed.data.resolution === "jira_wins" &&
    (INBOUND_AUTOAPPLY_FIELDS as readonly string[]).includes(row.field)
  ) {
    const { error: updErr } = await supabase
      .from("work_items")
      .update({ [row.field]: row.jira_value })
      .eq("id", row.work_item_id)
      .eq("project_id", projectId)
    if (updErr) {
      if (updErr.code === "42501") return apiError("forbidden", "Not allowed to edit this work item.", 403)
      if (updErr.code === "23514") return apiError("constraint_violation", updErr.message, 422)
      return apiError("update_failed", updErr.message, 500)
    }
    applied = true
  }

  const { error: resErr } = await supabase
    .from("jira_sync_conflicts")
    .update({
      resolution: parsed.data.resolution,
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", cid)
    .eq("project_id", projectId)
    .eq("resolution", "pending") // race-safe
  if (resErr) {
    if (resErr.code === "42501") return apiError("forbidden", "Not allowed to resolve.", 403)
    return apiError("update_failed", resErr.message, 500)
  }

  return NextResponse.json(
    { ok: true, resolution: parsed.data.resolution, applied },
    { status: 200 },
  )
}
