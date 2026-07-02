import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { addCommitteeMemberSchema } from "../../_schema"

// PROJ-98 — add a committee member via add_committee_member RPC.
// POST /api/projects/[id]/committees/[committeeId]/members
// Manager + need-to-know + H5 stakeholder-project consistency enforced server-side.

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; committeeId: string }> }
) {
  const { id: projectId, committeeId } = await context.params
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(committeeId).success
  ) {
    return apiError("validation_error", "Invalid id.", 400)
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
  const parsed = addCommitteeMemberSchema.safeParse(body)
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

  const { data, error } = await supabase.rpc("add_committee_member", {
    p_committee_id: committeeId,
    p_stakeholder_id: d.stakeholder_id,
    p_role_in_committee: d.role_in_committee ?? "member",
    p_is_voting: d.is_voting ?? true,
  })

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Not authorized to add a member.", 403)
    }
    if (error.code === "P0002") {
      return apiError("not_found", "Committee or stakeholder not found.", 404)
    }
    if (error.code === "23505") {
      return apiError("conflict", "Stakeholder is already a member.", 409)
    }
    if (error.code?.startsWith("23") || error.code === "22023") {
      return apiError("validation_error", error.message, 400)
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ member: data }, { status: 201 })
}
