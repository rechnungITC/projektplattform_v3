/**
 * PROJ-31 — Internal Approver respond endpoint.
 *
 * POST /api/projects/[id]/decisions/[did]/approval/respond/[approverId]
 *
 * Used by an authenticated Plattform-Account whose user_id matches the
 * stakeholder.linked_user_id of the nominated approver. The Magic-Link
 * flow at /api/approve/[token] handles the no-auth path.
 *
 * Both flows funnel into the same `record_approval_response` RPC for
 * race-condition-free quorum updates.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

const respondSchema = z.object({
  response: z.enum(["approve", "reject"]),
  comment: z.string().trim().max(4000).nullable().optional(),
})

interface Ctx {
  params: Promise<{ id: string; did: string; approverId: string }>
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId, did: decisionId, approverId } = await ctx.params
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
  const parsed = respondSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
    )
  }

  // Verify the caller is the linked_user_id of the approver-stakeholder.
  const { data: approverData, error: apErr } = await supabase
    .from("decision_approvers")
    .select(
      "id, decision_id, response, magic_link_expires_at, " +
        "stakeholders!decision_approvers_stakeholder_id_fkey(linked_user_id)",
    )
    .eq("id", approverId)
    .eq("decision_id", decisionId)
    .maybeSingle()
  if (apErr) return apiError("internal_error", apErr.message, 500)
  type ApproverRow = {
    id: string
    decision_id: string
    response: string | null
    magic_link_expires_at: string | null
    stakeholders?: { linked_user_id: string | null } | null
  }
  const approver = approverData as unknown as ApproverRow | null
  if (!approver) return apiError("not_found", "Approver not found.", 404)

  const stakeholders = approver.stakeholders
  if (!stakeholders?.linked_user_id) {
    return apiError(
      "forbidden",
      "This approver has no platform user linked — use the Magic-Link.",
      403,
    )
  }
  if (stakeholders.linked_user_id !== userId) {
    return apiError(
      "forbidden",
      "You are not the linked user for this approver.",
      403,
    )
  }

  if (approver.response !== null) {
    return apiError("conflict", "You have already responded.", 409)
  }
  if (
    approver.magic_link_expires_at &&
    new Date(approver.magic_link_expires_at).getTime() < Date.now()
  ) {
    return apiError("conflict", "Approver token has expired.", 409)
  }

  const { error: rpcErr } = await supabase.rpc("record_approval_response", {
    p_decision_id: decisionId,
    p_approver_id: approverId,
    p_response: parsed.data.response,
    p_comment: parsed.data.comment ?? null,
    p_actor_user_id: userId,
  })
  if (rpcErr) {
    return apiError("internal_error", rpcErr.message, 500)
  }

  return NextResponse.json({ ok: true })
}
