import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PATCH /api/projects/[id]/members/[userId] — change a member's role
// DELETE /api/projects/[id]/members/[userId] — remove a member
//
// Pre-checked via `requireProjectAccess(..., 'manage_members')`. The last-lead
// trigger blocks removing/demoting the only lead and surfaces as 422.

const changeRoleSchema = z.object({
  role: z.enum(["lead", "editor", "viewer"]),
})

function validateIds(projectId: string, userId: string) {
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(userId).success) {
    return apiError("validation_error", "Invalid user id.", 400, "userId")
  }
  return null
}

function mapMutationError(code: string | undefined, message: string) {
  if (code === "check_violation") {
    return apiError("last_lead", message, 422)
  }
  if (code === "42501") {
    return apiError(
      "forbidden",
      "Only project leads or tenant admins can manage members.",
      403
    )
  }
  return null
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; userId: string }> }
) {
  const { id: projectId, userId: targetUserId } = await context.params
  const idError = validateIds(projectId, targetUserId)
  if (idError) return idError

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = changeRoleSchema.safeParse(body)
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

  const { data: row, error } = await supabase
    .from("project_memberships")
    .update({ role: parsed.data.role })
    .eq("project_id", projectId)
    .eq("user_id", targetUserId)
    .select()
    .single()

  if (error) {
    const mapped = mapMutationError(error.code, error.message)
    if (mapped) return mapped
    if (error.code === "PGRST116") {
      return apiError("not_found", "Membership not found.", 404)
    }
    return apiError("update_failed", error.message, 500)
  }

  return NextResponse.json({ membership: row }, { status: 200 })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; userId: string }> }
) {
  const { id: projectId, userId: targetUserId } = await context.params
  const idError = validateIds(projectId, targetUserId)
  if (idError) return idError

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

  const { error } = await supabase
    .from("project_memberships")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", targetUserId)

  if (error) {
    const mapped = mapMutationError(error.code, error.message)
    if (mapped) return mapped
    return apiError("delete_failed", error.message, 500)
  }

  return new NextResponse(null, { status: 204 })
}
