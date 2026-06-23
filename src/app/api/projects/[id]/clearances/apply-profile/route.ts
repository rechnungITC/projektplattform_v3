import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-100b — apply a clearance profile to a user on a project.
//
// POST /api/projects/[id]/clearances/apply-profile  { user_id, profile_id }
//
// Delegates to the apply_clearance_profile RPC, which resolves the ACTIVE
// profile (same tenant), enforces authority + tenant via the shared grant path,
// applies the downgrade guard, and writes the audit row. No parallel write.

const bodySchema = z.object({
  user_id: z.string().uuid(),
  profile_id: z.string().uuid(),
})

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // Clean 404 before the RPC (RLS hides cross-tenant projects). Final authority
  // (admin/lead) is enforced inside the RPC.
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { data, error } = await supabase.rpc("apply_clearance_profile", {
    p_project_id: projectId,
    p_user_id: parsed.data.user_id,
    p_profile_id: parsed.data.profile_id,
  })

  if (error) {
    // 42501 = not authorized; P0002 = project / profile not found-or-inactive.
    if (error.code === "42501") {
      return apiError("forbidden", "Not authorized to apply clearances.", 403)
    }
    if (error.code === "P0002") {
      return apiError(
        "not_found",
        "Project or active profile not found.",
        404
      )
    }
    return apiError("apply_failed", error.message, 500)
  }

  return NextResponse.json({ clearance: data }, { status: 201 })
}
