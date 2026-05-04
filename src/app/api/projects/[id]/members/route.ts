import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { addMemberSchema, normalizeMemberPayload } from "./_schema"

// POST /api/projects/[id]/members — add a project member.
// Pre-checked via `requireProjectAccess(..., 'manage_members')` for clean 403
// instead of falling through to RLS denial. RLS still gates the INSERT and
// the cross-tenant trigger guards the target user.

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params

  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = addMemberSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(
    supabase,
    projectId,
    userId,
    "manage_members"
  )
  if (access.error) return access.error

  // Spread-Pattern: schema is the single source of truth.
  const insertPayload = {
    ...normalizeMemberPayload(parsed.data),
    project_id: projectId,
    created_by: userId,
  }

  const { data: row, error } = await supabase
    .from("project_memberships")
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    if (error.code === "22023") {
      return apiError("invalid_parameter", error.message, 422, "user_id")
    }
    if (error.code === "23505") {
      return apiError(
        "already_member",
        "User is already a member of this project.",
        409,
        "user_id"
      )
    }
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Only project leads or tenant admins can add members.",
        403
      )
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ membership: row }, { status: 201 })
}
