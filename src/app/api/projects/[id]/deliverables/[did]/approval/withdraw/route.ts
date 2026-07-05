import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-105 α — withdraw a running approval workflow. Authority (submitter /
// project-lead / tenant-admin) is enforced inside withdraw_deliverable_approval.

const withdrawSchema = z.object({ approval_id: z.string().uuid() })

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
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = withdrawSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_error", "approval_id (uuid) is required.", 400, "approval_id")
  }

  const { data, error } = await supabase.rpc("withdraw_deliverable_approval", {
    p_approval_id: parsed.data.approval_id,
  })

  if (error) {
    if (error.code === "42501") return apiError("forbidden", error.message, 403)
    if (error.code === "P0002") return apiError("not_found", "Approval not found.", 404)
    if (error.code === "22023") return apiError("invalid_state", error.message, 422)
    return apiError("withdraw_failed", error.message, 500)
  }
  return NextResponse.json({ approval: data })
}
