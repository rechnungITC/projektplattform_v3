/**
 * PROJ-31 — Internal Approver respond endpoint.
 *
 * POST /api/projects/[id]/decisions/[did]/approval/respond/[approverId]
 *
 * Used by an authenticated Plattform-Account whose user_id matches the
 * stakeholder.linked_user_id of the nominated approver. The Magic-Link
 * flow at /api/approve/[token] handles the no-auth path.
 *
 * Three actions:
 *   - approve  → final, calls record_approval_response RPC, optional comment.
 *   - reject   → final, calls RPC, comment required, creates open_item.
 *   - request_info → non-final, sets decision_approvers.request_info_*,
 *                    creates open_item; approver stays in pending list.
 *
 * Backward-compat: the legacy body `{ response: "approve"|"reject", comment }`
 * is still accepted and routed to the matching action branch.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { createApprovalFeedback } from "@/lib/decisions/approval-feedback"

const actionBody = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    comment: z.string().trim().max(4000).nullable().optional(),
  }),
  z.object({
    action: z.literal("reject"),
    comment: z.string().trim().min(5).max(4000),
  }),
  z.object({
    action: z.literal("request_info"),
    comment: z.string().trim().min(5).max(4000),
  }),
])

const legacyBody = z.object({
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

  // Discriminated-union first; fall back to legacy { response, comment } shape.
  let action: "approve" | "reject" | "request_info"
  let comment: string | null
  const newShape = actionBody.safeParse(body)
  if (newShape.success) {
    action = newShape.data.action
    comment = newShape.data.comment ?? null
  } else {
    const legacy = legacyBody.safeParse(body)
    if (!legacy.success) {
      const first = legacy.error.issues[0]
      return apiError(
        "validation_error",
        first?.message ?? "Invalid request body.",
        400,
      )
    }
    action = legacy.data.response
    comment = legacy.data.comment ?? null
    // Reject requires a non-empty comment in the new shape; enforce here too.
    if (action === "reject" && (!comment || comment.trim().length < 5)) {
      return apiError(
        "validation_error",
        "Begründung erforderlich (mindestens 5 Zeichen).",
        400,
        "comment",
      )
    }
  }

  // Verify the caller is the linked_user_id of the approver-stakeholder.
  const { data: approverData, error: apErr } = await supabase
    .from("decision_approvers")
    .select(
      "id, decision_id, response, magic_link_expires_at, " +
        "stakeholder_id, " +
        "stakeholders!decision_approvers_stakeholder_id_fkey(linked_user_id, name)",
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
    stakeholder_id: string
    stakeholders?: { linked_user_id: string | null; name: string | null } | null
  }
  const approver = approverData as unknown as ApproverRow | null
  if (!approver) return apiError("not_found", "Approver not found.", 404)

  const stakeholder = approver.stakeholders
  if (!stakeholder?.linked_user_id) {
    return apiError(
      "forbidden",
      "This approver has no platform user linked — use the Magic-Link.",
      403,
    )
  }
  if (stakeholder.linked_user_id !== userId) {
    return apiError(
      "forbidden",
      "You are not the linked user for this approver.",
      403,
    )
  }

  // Final responses are one-shot; request_info can repeat.
  if (action !== "request_info" && approver.response !== null) {
    return apiError("conflict", "You have already responded.", 409)
  }
  if (
    approver.magic_link_expires_at &&
    new Date(approver.magic_link_expires_at).getTime() < Date.now()
  ) {
    return apiError("conflict", "Approver token has expired.", 409)
  }

  // Decision title + tenant id for feedback content.
  const { data: decisionRow } = await supabase
    .from("decisions")
    .select("title, tenant_id")
    .eq("id", decisionId)
    .maybeSingle()
  const decisionTitle = decisionRow?.title ?? "(ohne Titel)"
  const tenantId = decisionRow?.tenant_id ?? ""
  const approverName = stakeholder.name ?? "Approver"

  if (action === "request_info") {
    const { error: updErr } = await supabase
      .from("decision_approvers")
      .update({
        request_info_comment: comment,
        request_info_at: new Date().toISOString(),
      })
      .eq("id", approverId)
    if (updErr) return apiError("internal_error", updErr.message, 500)

    // Append append-only audit event.
    await supabase.from("decision_approval_events").insert({
      decision_id: decisionId,
      type: "approver_requested_info",
      actor_user_id: userId,
      payload: { approver_id: approverId, comment },
    })
  } else {
    // approve | reject — call the existing race-safe RPC.
    const { error: rpcErr } = await supabase.rpc("record_approval_response", {
      p_decision_id: decisionId,
      p_approver_id: approverId,
      p_response: action,
      p_comment: comment,
      p_actor_user_id: userId,
    })
    if (rpcErr) {
      return apiError("internal_error", rpcErr.message, 500)
    }
  }

  // Project feedback: outbox for all 3 actions; open_item for reject + request_info.
  // Errors are swallowed inside the helper — primary response is already persisted.
  if (tenantId) {
    await createApprovalFeedback({
      supabase,
      projectId,
      tenantId,
      decisionId,
      decisionTitle,
      action,
      approverStakeholderId: approver.stakeholder_id,
      approverName,
      comment,
      createdBy: userId,
    })
  }

  return NextResponse.json({ ok: true, action })
}
