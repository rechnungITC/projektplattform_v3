/**
 * PROJ-79-α — GET /api/projects/[id]/documents/tree
 *
 * List non-deleted document-tree nodes for a project.
 *   - `?all=true`            → every node in the project (client builds the
 *                              forest; used by the DMS tree UI, mirrors the
 *                              org-tree "flat list → forest" pattern).
 *   - `?parent_id=<uuid>`    → a folder's direct children (lazy expansion).
 *   - omitted / `root`       → the project root (parent_id IS NULL).
 * Document nodes carry their linked `documents` metadata (id, mime_type,
 * size_bytes, original_filename). Folders first, then alphabetical.
 *
 * Access: project member ("view"). RLS additionally scopes every row.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import type { TreeNodeDocumentMeta, TreeNodeWithDocument } from "@/types/dms"

const TREE_SELECT =
  "id, tenant_id, project_id, parent_id, node_type, name, slug, sort_order, " +
  "confidentiality_level, created_by, created_at, updated_at, deleted_at, " +
  "documents(id, mime_type, size_bytes, original_filename, deleted_at)"

interface RawTreeRow {
  documents?: Array<TreeNodeDocumentMeta & { deleted_at: string | null }> | null
  [key: string]: unknown
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const url = new URL(request.url)
  const all = url.searchParams.get("all") === "true"
  const parentParam = url.searchParams.get("parent_id")

  let query = supabase
    .from("document_tree_nodes")
    .select(TREE_SELECT)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("node_type", { ascending: false }) // 'folder' > 'document' → folders first
    .order("name", { ascending: true })
    .limit(1000)

  if (all) {
    // Whole-tree load — no parent filter. Client assembles the forest.
  } else if (parentParam && parentParam !== "root") {
    if (!z.string().uuid().safeParse(parentParam).success) {
      return apiError("validation_error", "Invalid parent_id.", 400, "parent_id")
    }
    query = query.eq("parent_id", parentParam)
  } else {
    query = query.is("parent_id", null)
  }

  const { data, error } = await query
  if (error) return apiError("list_failed", error.message, 500)

  const nodes: TreeNodeWithDocument[] = ((data ?? []) as unknown as RawTreeRow[]).map(
    (row) => {
      const { documents, ...node } = row
      const live = (documents ?? []).find((d) => d.deleted_at === null) ?? null
      const document: TreeNodeDocumentMeta | null = live
        ? {
            id: live.id,
            mime_type: live.mime_type,
            size_bytes: live.size_bytes,
            original_filename: live.original_filename,
          }
        : null
      return { ...(node as unknown as TreeNodeWithDocument), document }
    },
  )

  return NextResponse.json({ nodes })
}
