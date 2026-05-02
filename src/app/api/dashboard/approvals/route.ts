/**
 * PROJ-31 — GET /api/dashboard/approvals
 *
 * Returns the list of pending Decision-Approvals where the logged-in user
 * is nominated via a Stakeholder whose linked_user_id matches.
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
  decisions: {
    title: string
    project_id: string
    is_revised: boolean
    projects?: { name?: string } | null
    decision_approval_state?: {
      status: string
      submitted_at: string | null
    } | null
  } | null
}

export async function GET(_request: Request) {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // Find pending approver-rows where the linked stakeholder is mapped to
  // this user. RLS scopes everything to tenants where the user is a member.
  const { data, error } = await supabase
    .from("decision_approvers")
    .select(
      "id, decision_id, magic_link_expires_at, " +
        "stakeholders!inner(linked_user_id), " +
        "decisions!inner(title, project_id, is_revised, " +
        "projects!inner(name), " +
        "decision_approval_state!inner(status, submitted_at))",
    )
    .is("response", null)
    .eq("stakeholders.linked_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100)
  if (error) return apiError("internal_error", error.message, 500)

  const approvals = (data ?? [])
    .map((r) => {
      const row = r as unknown as ApproverRow
      if (
        !row.decisions ||
        row.decisions.is_revised ||
        row.decisions.decision_approval_state?.status !== "pending"
      ) {
        return null
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
      }
    })
    .filter((x) => x !== null)

  return NextResponse.json({ approvals })
}
