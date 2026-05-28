/**
 * PROJ-65 ε.4.β — accept (advisory) a resource-swap suggestion.
 *
 * POST /api/projects/[id]/ai/resource-swap/[sid]/accept
 *
 * Flips `draft` → `accepted` without creating a downstream DB entity.
 * Per CIA-L4 the AI accept is intentionally decoupled from the
 * operational swap action: a separate "Im Swap-Preview öffnen" button in
 * the UI wires to PROJ-65 ε.2's `/work-items/[wid]/stakeholder-swap-
 * preview` endpoint with its own audit trail.
 *
 * The relaxed `ki_suggestions_accepted_consistency` CHECK (PROJ-65 ε.4.β
 * migration) admits accepted-without-entity-link for this purpose.
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
  if (existing.purpose !== "resource_swap") {
    return apiError(
      "wrong_purpose",
      "This endpoint only accepts resource_swap suggestions.",
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
    return apiError(
      "conflict",
      "Suggestion changed state during the request — please reload.",
      409,
    )
  }

  return NextResponse.json({ suggestion: data }, { status: 200 })
}
