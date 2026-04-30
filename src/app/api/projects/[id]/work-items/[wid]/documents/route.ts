import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"

// -----------------------------------------------------------------------------
// GET /api/projects/[id]/work-items/[wid]/documents
//   List compliance forms + manual attachments attached to a work item.
//   RLS gates by project membership.
// -----------------------------------------------------------------------------
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; wid: string }> }
) {
  const { id: projectId, wid: workItemId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(workItemId).success) {
    return apiError("validation_error", "Invalid work item id.", 400, "wid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data, error } = await supabase
    .from("work_item_documents")
    .select("*")
    .eq("work_item_id", workItemId)
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ documents: data ?? [] })
}
