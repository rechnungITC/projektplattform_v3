import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"

// POST /api/projects/[id]/members — add a project member.
// Requires the caller to be tenant_admin OR project_lead. RLS enforces this
// alongside the API check; the cross-tenant guard trigger ensures the target
// user is a member of the project's tenant.

const addMemberSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["lead", "editor", "viewer"]),
})

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

  const { data: row, error } = await supabase
    .from("project_memberships")
    .insert({
      project_id: projectId,
      user_id: parsed.data.user_id,
      role: parsed.data.role,
      created_by: userId,
    })
    .select()
    .single()

  if (error) {
    // Cross-tenant guard trigger: user not in tenant
    if (error.code === "22023") {
      return apiError("invalid_parameter", error.message, 422, "user_id")
    }
    // Unique constraint violation (already a member)
    if (error.code === "23505") {
      return apiError("already_member", "User is already a member of this project.", 409, "user_id")
    }
    // RLS denial
    if (error.code === "42501") {
      return apiError("forbidden", "Only project leads or tenant admins can add members.", 403)
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ membership: row }, { status: 201 })
}
