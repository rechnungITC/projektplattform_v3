import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"

// PROJ-8 — POST /api/projects/[id]/stakeholders/suggestions/clear
// Removes all dismissed suggestions for this project so they can resurface.

interface Ctx {
  params: Promise<{ id: string }>
}

export async function POST(_request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const { error, count } = await supabase
    .from("stakeholder_suggestion_dismissals")
    .delete({ count: "exact" })
    .eq("project_id", projectId)

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Editor or lead role required to clear dismissals.",
        403
      )
    }
    return apiError("clear_failed", error.message, 500)
  }
  return NextResponse.json({ cleared: count ?? 0 })
}
