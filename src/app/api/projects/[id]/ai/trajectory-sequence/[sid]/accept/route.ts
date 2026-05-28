/**
 * PROJ-65 ε.4.α — accept (advisory) a trajectory-sequence suggestion.
 *
 * POST /api/projects/[id]/ai/trajectory-sequence/[sid]/accept
 *
 * Flips status `draft` → `accepted` without creating a downstream DB
 * entity. The relaxed `ki_suggestions_accepted_consistency` CHECK (PROJ-65
 * ε.4.α migration) permits this for `purpose='trajectory_sequence'`:
 * trajectory-sequence is purely advisory, the user then opens the
 * Plan-Mutate flow on the affected nodes to apply real changes.
 *
 * Authorization: project editor/lead/tenant-admin (via requireProjectAccess
 * `edit`). RLS additionally scopes the suggestion to the caller's tenant.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../../_lib/route-helpers"

interface Ctx {
  params: Promise<{ id: string; sid: string }>
}

export async function POST(_request: Request, ctx: Ctx) {
  const { id: projectId, sid } = await ctx.params

  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "id must be a UUID.", 400, "id")
  }
  if (!z.string().uuid().safeParse(sid).success) {
    return apiError("validation_error", "sid must be a UUID.", 400, "sid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  // Verify suggestion exists, belongs to this project, is the right
  // purpose, and is still draft.
  const { data: existing, error: lookupErr } = await supabase
    .from("ki_suggestions")
    .select("id, project_id, purpose, status")
    .eq("id", sid)
    .eq("project_id", projectId)
    .maybeSingle()
  if (lookupErr) return apiError("read_failed", lookupErr.message, 500)
  if (!existing) {
    return apiError("not_found", "Suggestion not found in this project.", 404)
  }
  if (existing.purpose !== "trajectory_sequence") {
    return apiError(
      "wrong_purpose",
      "This endpoint only accepts trajectory_sequence suggestions.",
      400,
    )
  }
  if (existing.status !== "draft") {
    return apiError(
      "conflict",
      "Suggestion is no longer pending (already accepted or rejected).",
      409,
    )
  }

  // Advisory accept — no entity link required (CHECK relaxed for this purpose).
  const { data, error } = await supabase
    .from("ki_suggestions")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
    })
    .eq("id", sid)
    .eq("status", "draft")
    .select("id, status, accepted_at")
    .maybeSingle()

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Not allowed to accept this suggestion.", 403)
    }
    return apiError("update_failed", error.message, 500)
  }
  if (!data) {
    // Lost the race with a concurrent accept/reject.
    return apiError(
      "conflict",
      "Suggestion changed state during the request — please reload.",
      409,
    )
  }

  return NextResponse.json({ suggestion: data }, { status: 200 })
}
