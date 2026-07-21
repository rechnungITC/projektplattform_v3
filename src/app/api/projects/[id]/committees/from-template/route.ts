import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-117 (AC1) — instantiate a committee from a template
// (create_committee_from_template RPC; authority + clearance server-side).
const schema = z.object({ template_id: z.string().uuid() })

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
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_error", "template_id (uuid) required.", 400, "template_id")
  }

  const { data, error } = await supabase.rpc("create_committee_from_template", {
    p_project_id: projectId,
    p_template_id: parsed.data.template_id,
  })
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not authorized.", 403)
    if (error.code === "P0002") return apiError("not_found", "Template or project not found.", 404)
    return apiError("create_failed", error.message, 500)
  }
  return NextResponse.json({ committee: data }, { status: 201 })
}
