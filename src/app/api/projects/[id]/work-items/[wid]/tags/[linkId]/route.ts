import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"

// -----------------------------------------------------------------------------
// DELETE /api/projects/[id]/work-items/[wid]/tags/[linkId]
//   Detach a tag from a work item. Does NOT roll back already-created
//   child work-items or documents — those are first-class entities the
//   user can edit/delete independently. The trigger log row stays so a
//   re-attach won't re-fire (which would create duplicates).
// -----------------------------------------------------------------------------
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; wid: string; linkId: string }> }
) {
  const { id: projectId, wid: workItemId, linkId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(workItemId).success) {
    return apiError("validation_error", "Invalid work item id.", 400, "wid")
  }
  if (!z.string().uuid().safeParse(linkId).success) {
    return apiError("validation_error", "Invalid link id.", 400, "linkId")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data, error } = await supabase
    .from("work_item_tags")
    .delete()
    .eq("id", linkId)
    .eq("work_item_id", workItemId)
    .select("id")
    .maybeSingle()

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Editor or lead role required.", 403)
    return apiError("delete_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Tag link not found.", 404)
  return new NextResponse(null, { status: 204 })
}
