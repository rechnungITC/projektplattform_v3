/**
 * PROJ-31 — POST /api/projects/[id]/decisions/[did]/approval/withdraw
 *
 * Withdraws a pending Decision-Approval. Marks state 'withdrawn',
 * marks all unanswered approvers 'withdrawn' (so leftover Magic-Link
 * clicks bounce), and writes an audit event with the optional reason.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

const schema = z.object({
  reason: z.string().trim().max(2000).nullable().optional(),
})

interface Ctx {
  params: Promise<{ id: string; did: string }>
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId, did: decisionId } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_error", "Invalid request body.", 400)
  }

  const { data: state, error: stateErr } = await supabase
    .from("decision_approval_state")
    .select("decision_id, tenant_id, status")
    .eq("decision_id", decisionId)
    .maybeSingle()
  if (stateErr) return apiError("internal_error", stateErr.message, 500)
  if (!state) return apiError("not_found", "Approval state not found.", 404)
  if (state.status !== "pending") {
    return apiError(
      "conflict",
      `Cannot withdraw — current status: ${state.status}.`,
      409,
    )
  }

  // Cross-tenant guard.
  const { data: decision, error: decErr } = await supabase
    .from("decisions")
    .select("tenant_id, project_id")
    .eq("id", decisionId)
    .maybeSingle()
  if (decErr) return apiError("internal_error", decErr.message, 500)
  if (!decision || decision.project_id !== projectId) {
    return apiError("not_found", "Decision not found.", 404)
  }

  const { error: stateUpd } = await supabase
    .from("decision_approval_state")
    .update({
      status: "withdrawn",
      decided_at: new Date().toISOString(),
    })
    .eq("decision_id", decisionId)
  if (stateUpd) return apiError("internal_error", stateUpd.message, 500)

  // Invalidate pending tokens — set their response to 'withdrawn' so a
  // late Magic-Link click hits an "already responded" path on the public
  // route (the route then renders the withdrawn view).
  const { error: apUpd } = await supabase
    .from("decision_approvers")
    .update({
      response: "withdrawn",
      responded_at: new Date().toISOString(),
    })
    .eq("decision_id", decisionId)
    .is("response", null)
  if (apUpd) return apiError("internal_error", apUpd.message, 500)

  const { error: evtErr } = await supabase
    .from("decision_approval_events")
    .insert({
      tenant_id: state.tenant_id,
      decision_id: decisionId,
      event_type: "withdrawn",
      actor_user_id: userId,
      payload: { reason: parsed.data.reason ?? null },
    })
  if (evtErr) return apiError("internal_error", evtErr.message, 500)

  return NextResponse.json({ ok: true })
}
