/**
 * PROJ-31 — GET /api/dashboard/approvals
 *
 * Returns Decision-Approvals where the logged-in user is nominated via a
 * Stakeholder whose linked_user_id matches.
 *
 * Query params:
 *   ?filter=pending   (default) — approver row has no `response` yet AND
 *                                  the decision's approval state is 'pending'.
 *   ?filter=answered             — approver row has `response IN ('approve','reject')`
 *                                  (the user has finally responded). Useful to
 *                                  surface "what I already approved/rejected".
 */

import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
} from "@/app/api/_lib/route-helpers"

interface ApproverRow {
  id: string
  decision_id: string
  magic_link_expires_at: string | null
  response: "approve" | "reject" | null
  responded_at: string | null
  comment: string | null
  decisions: {
    title: string
    project_id: string
    is_revised: boolean
    projects?: { name?: string } | null
    decision_approval_state?: {
      status: string
      submitted_at: string | null
      deadline_at: string | null
    } | null
  } | null
}

export async function GET(request: Request) {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const url = new URL(request.url)
  const filter = url.searchParams.get("filter") === "answered" ? "answered" : "pending"

  let query = supabase
    .from("decision_approvers")
    .select(
      "id, decision_id, magic_link_expires_at, response, responded_at, comment, " +
        "stakeholders!inner(linked_user_id), " +
        "decisions!inner(title, project_id, is_revised, " +
        "projects!inner(name), " +
        "decision_approval_state!inner(status, submitted_at, deadline_at))",
    )
    .eq("stakeholders.linked_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100)

  if (filter === "pending") {
    query = query.is("response", null)
  } else {
    query = query.in("response", ["approve", "reject"])
  }

  const { data, error } = await query
  if (error) return apiError("internal_error", error.message, 500)

  const approvals = (data ?? [])
    .map((r) => {
      const row = r as unknown as ApproverRow
      if (!row.decisions) return null
      // For pending: only show pending decisions.
      if (filter === "pending") {
        if (
          row.decisions.is_revised ||
          row.decisions.decision_approval_state?.status !== "pending"
        ) {
          return null
        }
      }
      return {
        decision_id: row.decision_id,
        decision_title: row.decisions.title,
        project_id: row.decisions.project_id,
        project_name: row.decisions.projects?.name ?? "Projekt",
        approver_id: row.id,
        magic_link_expires_at: row.magic_link_expires_at,
        submitted_at:
          row.decisions.decision_approval_state?.submitted_at ?? null,
        deadline_at:
          row.decisions.decision_approval_state?.deadline_at ?? null,
        response: row.response,
        responded_at: row.responded_at,
        comment: row.comment,
        approval_status:
          row.decisions.decision_approval_state?.status ?? "pending",
      }
    })
    .filter((x) => x !== null)

  return NextResponse.json({ approvals })
}
