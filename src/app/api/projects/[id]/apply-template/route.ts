import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-96 (AC3/AC4) — apply an M&A project template to a project (copy-on-create).
//
// POST /api/projects/[id]/apply-template  body: { templateId: uuid }
//
// The apply_ma_project_template RPC owns the M&A-type check, the caller
// authority (tenant-admin / project-lead), the single-use re-apply block and
// the copy transaction (reuses activate_ma_phase_model for phases, then copies
// workstreams + deliverables with a provenance stamp). The route only verifies
// project visibility and maps RPC error codes.
const bodySchema = z.object({ templateId: z.string().uuid() })

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

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase.rpc("apply_ma_project_template", {
    p_project_id: projectId,
    p_template_id: parsed.data.templateId,
  })

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Only a project lead or tenant admin can apply a template.",
        403
      )
    }
    if (error.code === "P0002") {
      return apiError(
        "not_found",
        "Project or template not found (or template inactive).",
        404
      )
    }
    if (error.code === "P0001") {
      // not-an-M&A-project OR project already populated (single-use block)
      return apiError("apply_conflict", error.message, 409)
    }
    return apiError("apply_failed", error.message, 500)
  }

  return NextResponse.json(data)
}
