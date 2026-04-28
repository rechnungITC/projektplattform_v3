import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"

// PROJ-8 — POST /api/projects/[id]/stakeholders/suggestions/dismiss
// Body: { role_key: string }
// Records that this role suggestion should be hidden for this project.

const dismissSchema = z.object({
  role_key: z.string().trim().min(1).max(100),
})

interface Ctx {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = dismissSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(
      "validation_error",
      "role_key is required.",
      400,
      "role_key"
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const { error } = await supabase
    .from("stakeholder_suggestion_dismissals")
    .upsert(
      {
        project_id: projectId,
        tenant_id: access.project.tenant_id,
        role_key: parsed.data.role_key,
        dismissed_by: userId,
      },
      { onConflict: "project_id,role_key" }
    )

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Editor or lead role required to dismiss suggestions.",
        403
      )
    }
    return apiError("dismiss_failed", error.message, 500)
  }
  return NextResponse.json({ ok: true })
}
