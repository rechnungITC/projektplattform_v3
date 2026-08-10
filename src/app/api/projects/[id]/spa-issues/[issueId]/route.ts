import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { updateSpaIssueSchema } from "../_schema"

// PROJ-122 — PATCH /api/projects/[id]/spa-issues/[issueId]
// Update via update_spa_issue RPC. The RPC re-checks role AND clearance for
// both the current and the target confidentiality level (AC-122-H4), so a user
// can neither edit what they may not read nor escalate a row out of their own
// reach.
//
// `null` in the body means "clear this field"; an omitted key means "leave
// unchanged" - the RPC exposes explicit p_clear_* flags for that distinction.

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; issueId: string }> }
) {
  const { id: projectId, issueId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(issueId).success) {
    return apiError("validation_error", "Invalid issue id.", 400, "issueId")
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
  const parsed = updateSpaIssueSchema.safeParse(body)
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
  const has = (k: keyof typeof d) => Object.prototype.hasOwnProperty.call(d, k)

  const { data, error } = await supabase.rpc("update_spa_issue", {
    p_issue_id: issueId,
    p_title: d.title ?? null,
    p_clause_reference: d.clause_reference ?? null,
    p_category: d.category ?? null,
    p_own_position: d.own_position ?? null,
    p_counterparty_position: d.counterparty_position ?? null,
    p_recommended_solution: d.recommended_solution ?? null,
    p_risk_if_no_agreement: d.risk_if_no_agreement ?? null,
    p_importance: d.importance ?? null,
    p_responsible_user_id: d.responsible_user_id ?? null,
    p_clear_responsible: has("responsible_user_id") && d.responsible_user_id === null,
    p_due_date: d.due_date ?? null,
    p_clear_due_date: has("due_date") && d.due_date === null,
    p_linked_finding_id: d.linked_finding_id ?? null,
    p_clear_finding: has("linked_finding_id") && d.linked_finding_id === null,
    p_linked_risk_id: d.linked_risk_id ?? null,
    p_clear_risk: has("linked_risk_id") && d.linked_risk_id === null,
    p_confidentiality_level: d.confidentiality_level ?? null,
  })

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Not authorized to update this SPA issue.", 403)
    }
    if (error.code === "P0002") {
      return apiError("not_found", "SPA issue not found.", 404)
    }
    if (error.code?.startsWith("23") || error.code === "22023") {
      return apiError("validation_error", error.message, 400)
    }
    return apiError("update_failed", error.message, 500)
  }

  return NextResponse.json({ issue: data })
}
