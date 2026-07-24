/**
 * PROJ-79-α — GET /api/projects/[id]/documents/[docId]/download
 *
 * Return a short-lived signed URL for an internal document's stored object.
 * The document lookup is RLS-scoped (cross-tenant → 404) and additionally
 * verified to belong to THIS project. Signed-URL creation runs under the
 * caller's RLS context, so a non-member can never sign a URL.
 *
 * Access: project member ("view").
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { createDocumentSignedUrl } from "@/lib/dms/storage"

const SIGNED_URL_TTL_SECONDS = 120

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; docId: string }> },
) {
  const { id: projectId, docId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(docId).success) {
    return apiError("validation_error", "Invalid document id.", 400, "docId")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, storage_path, deleted_at, document_tree_nodes(project_id)")
    .eq("id", docId)
    .maybeSingle()
  if (error) return apiError("internal_error", error.message, 500)

  const node = (doc as { document_tree_nodes?: { project_id?: string } | null } | null)
    ?.document_tree_nodes
  const docPath = (doc as { storage_path?: string; deleted_at?: string | null } | null)
  if (
    !doc ||
    docPath?.deleted_at != null ||
    !node ||
    node.project_id !== projectId
  ) {
    return apiError("not_found", "Document not found.", 404)
  }

  try {
    const url = await createDocumentSignedUrl(
      supabase,
      docPath!.storage_path!,
      SIGNED_URL_TTL_SECONDS,
    )
    return NextResponse.json({ url })
  } catch (err) {
    return apiError(
      "signing_failed",
      err instanceof Error ? err.message : "Could not sign URL.",
      500,
    )
  }
}
