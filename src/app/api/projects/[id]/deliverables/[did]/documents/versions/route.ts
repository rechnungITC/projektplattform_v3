import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { createDeliverableDocumentVersionSchema } from "../../../_schema"

// PROJ-106 — create a new deliverable-document version (AC1/AC2/AC4).
//
// POST /api/projects/[id]/deliverables/[did]/documents/versions
//
// Delegates to the SECURITY DEFINER RPC add_deliverable_document_version, which
// atomically INSERTs the new version (version_no+1, is_current=true) and flips
// the superseded head's is_current=false — one clean audit entry. The RPC
// re-checks role (admin/project-lead) + need-to-know (can_access_classified),
// so this route uses the session client (never service-role).

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
  const parsed = createDeliverableDocumentVersionSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { data, error } = await supabase.rpc("add_deliverable_document_version", {
    p_deliverable_id: did,
    p_title: parsed.data.title,
    p_url: parsed.data.url,
    p_supersedes_document_id: parsed.data.supersedes_document_id ?? undefined,
    p_version_comment: parsed.data.version_comment ?? undefined,
    p_tag_keys: parsed.data.tag_keys ?? undefined,
  })

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    if (error.code === "P0002") return apiError("not_found", "Deliverable not found.", 404)
    if (error.code === "23514" || error.code === "22023")
      return apiError("validation_error", error.message, 400)
    return apiError("version_failed", error.message, 500)
  }
  return NextResponse.json({ document: data }, { status: 201 })
}
