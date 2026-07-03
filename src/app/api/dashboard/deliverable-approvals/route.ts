/**
 * PROJ-105 α — GET /api/dashboard/deliverable-approvals
 *
 * My-Work surface: deliverable approval stages where the logged-in user is the
 * ACTIVE approver — i.e. the stage's approver stakeholder links to this user,
 * the stage has no response yet, the parent workflow is pending, and the stage
 * is the currently active one. RLS keeps this scoped to deliverables the user
 * may access (need-to-know gate), so nothing leaks across confidentiality.
 */

import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
} from "@/app/api/_lib/route-helpers"

interface StageRow {
  id: string
  stage_order: number
  deliverable_approvals: {
    id: string
    status: string
    current_stage_order: number
    deliverable_id: string
    project_id: string
    submitted_at: string
    projects?: { name?: string } | null
    deliverables?: { name?: string } | null
  } | null
  stakeholders: { linked_user_id: string | null } | null
}

export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data, error } = await supabase
    .from("deliverable_approval_stages")
    .select(
      "id, stage_order, " +
        "deliverable_approvals!inner(id, status, current_stage_order, deliverable_id, project_id, submitted_at, " +
        "projects!inner(name), deliverables!inner(name)), " +
        "stakeholders!inner(linked_user_id)"
    )
    .eq("stakeholders.linked_user_id", userId)
    .is("response", null)
    .limit(100)

  if (error) return apiError("internal_error", error.message, 500)

  const approvals = (data ?? [])
    .map((r) => {
      const row = r as unknown as StageRow
      const a = row.deliverable_approvals
      if (!a) return null
      // only the currently active stage of a still-pending workflow
      if (a.status !== "pending" || row.stage_order !== a.current_stage_order) {
        return null
      }
      return {
        approval_id: a.id,
        stage_id: row.id,
        stage_order: row.stage_order,
        deliverable_id: a.deliverable_id,
        deliverable_name: a.deliverables?.name ?? "Deliverable",
        project_id: a.project_id,
        project_name: a.projects?.name ?? "Projekt",
        submitted_at: a.submitted_at,
      }
    })
    .filter((x) => x !== null)

  return NextResponse.json({ approvals })
}
