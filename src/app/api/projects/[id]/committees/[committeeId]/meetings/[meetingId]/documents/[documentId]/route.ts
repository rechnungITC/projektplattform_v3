import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-117 — remove a meeting document link via remove_meeting_document RPC.
export async function DELETE(
  _request: Request,
  context: {
    params: Promise<{ id: string; committeeId: string; meetingId: string; documentId: string }>
  }
) {
  const { id: projectId, documentId } = await context.params
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(documentId).success
  ) {
    return apiError("validation_error", "Invalid id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { error } = await supabase.rpc("remove_meeting_document", { p_document_id: documentId })
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not authorized.", 403)
    if (error.code === "P0002") return apiError("not_found", "Document not found.", 404)
    return apiError("delete_failed", error.message, 500)
  }
  return NextResponse.json({ ok: true })
}
