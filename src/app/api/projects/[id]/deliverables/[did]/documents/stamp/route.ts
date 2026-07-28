import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { stampDeliverableDocumentVersionSchema } from "../../../_schema"

// PROJ-106 — link a document version to a PROJ-105 approval event (AC5).
//
// POST /api/projects/[id]/deliverables/[did]/documents/stamp
//
// Delegates to the SECURITY DEFINER RPC stamp_deliverable_document_version_approval,
// which validates the event belongs to an approval of THIS deliverable and
// set-once stamps approved_in_event_id. Role + need-to-know re-checked in the RPC.

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; did: string }> }
) {
  const { id: projectId, did } = await context.params
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(did).success
  ) {
    return apiError("validation_error", "Invalid id.", 400)
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
  const parsed = stampDeliverableDocumentVersionSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { data, error } = await supabase.rpc(
    "stamp_deliverable_document_version_approval",
    { p_document_id: parsed.data.document_id, p_event_id: parsed.data.event_id }
  )

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    if (error.code === "P0002") return apiError("not_found", "Document not found.", 404)
    if (error.code === "23514")
      return apiError("validation_error", error.message, 400)
    return apiError("stamp_failed", error.message, 500)
  }
  return NextResponse.json({ document: data })
}
