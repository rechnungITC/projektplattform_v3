/**
 * PROJ-79-α — POST /api/projects/[id]/tree/nodes
 *
 * Create a folder in the project document tree. Body:
 *   { parent_id?: uuid | null, name: string(1..200) }
 *
 * Validates the target parent (same project, is a live folder), derives a
 * URL-safe slug, dedups the name against live siblings (root or folder),
 * and inserts a `node_type='folder'` row. Access: lead/editor/admin ("edit").
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { createFolderSchema } from "@/lib/dms/schema"
import { dedupeName } from "@/lib/dms/slug"

const NODE_SELECT =
  "id, tenant_id, project_id, parent_id, node_type, name, slug, sort_order, " +
  "created_by, created_at, updated_at, deleted_at"

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = createFolderSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString(),
    )
  }

  const parentId = parsed.data.parent_id ?? null

  // Validate the parent when one is given: it must be a live folder in the
  // same project.
  if (parentId) {
    const { data: parent, error: parentErr } = await supabase
      .from("document_tree_nodes")
      .select("id, project_id, node_type, deleted_at")
      .eq("id", parentId)
      .maybeSingle()
    if (parentErr) return apiError("internal_error", parentErr.message, 500)
    if (!parent || parent.deleted_at !== null || parent.project_id !== projectId) {
      return apiError("not_found", "Parent folder not found.", 404, "parent_id")
    }
    if (parent.node_type !== "folder") {
      return apiError("validation_error", "Parent must be a folder.", 400, "parent_id")
    }
  }

  // Gather live sibling slugs for dedup.
  let siblingQuery = supabase
    .from("document_tree_nodes")
    .select("slug")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .limit(5000)
  siblingQuery = parentId
    ? siblingQuery.eq("parent_id", parentId)
    : siblingQuery.is("parent_id", null)

  const { data: siblings, error: sibErr } = await siblingQuery
  if (sibErr) return apiError("internal_error", sibErr.message, 500)
  const existingSlugs = (siblings ?? []).map((s) => (s as { slug: string }).slug)

  const { name, slug } = dedupeName(parsed.data.name, existingSlugs)

  const { data, error } = await supabase
    .from("document_tree_nodes")
    .insert({
      tenant_id: access.project.tenant_id,
      project_id: projectId,
      parent_id: parentId,
      node_type: "folder",
      name,
      slug,
      created_by: userId,
    })
    .select(NODE_SELECT)
    .single()

  if (error) {
    if (error.code === "23505") {
      return apiError("conflict", "A folder with that name already exists.", 409)
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ node: data }, { status: 201 })
}
