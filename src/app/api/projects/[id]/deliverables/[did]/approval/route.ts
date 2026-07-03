import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-105 α — deliverable approval workflow. GET returns all approval workflows
// for a deliverable (with stages + events) for the Freigabe section + history
// (AC5). POST submits the deliverable for a sequential approval workflow via
// submit_deliverable_for_approval.

const submitSchema = z.object({
  approver_stakeholder_ids: z.array(z.string().uuid()).min(1).max(20),
})

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; did: string }> }
) {
  const { id: projectId, did } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(did).success) {
    return apiError("validation_error", "Invalid deliverable id.", 400, "did")
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("deliverable_approvals")
    .select(
      "*, stages:deliverable_approval_stages(*), events:deliverable_approval_events(*)"
    )
    .eq("deliverable_id", did)
    .order("submitted_at", { ascending: false })
    .limit(50)

  if (error) return apiError("lookup_failed", error.message, 500)
  return NextResponse.json({ approvals: data ?? [] })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; did: string }> }
) {
  const { id: projectId, did } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(did).success) {
    return apiError("validation_error", "Invalid deliverable id.", 400, "did")
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(
    supabase,
    projectId,
    userId,
    "manage_members"
  )
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = submitSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(
      "validation_error",
      "approver_stakeholder_ids must be a non-empty array of stakeholder UUIDs (one per sequential stage).",
      400,
      "approver_stakeholder_ids"
    )
  }

  const { data, error } = await supabase.rpc("submit_deliverable_for_approval", {
    p_deliverable_id: did,
    p_approver_stakeholder_ids: parsed.data.approver_stakeholder_ids,
  })

  if (error) {
    if (error.code === "42501") return apiError("forbidden", error.message, 403)
    if (error.code === "P0002") return apiError("not_found", "Deliverable not found.", 404)
    if (error.code === "23505")
      return apiError("conflict", "A pending approval workflow already exists for this deliverable.", 409)
    if (error.code === "23514") return apiError("invalid_state", error.message, 422)
    if (error.code === "22023") return apiError("validation_error", error.message, 400)
    return apiError("submit_failed", error.message, 500)
  }
  return NextResponse.json({ approval: data }, { status: 201 })
}