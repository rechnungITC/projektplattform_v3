/**
 * PROJ-79-α — PATCH / DELETE /api/projects/[id]/tree/nodes/[nodeId]
 *
 * PATCH  — rename ({ name }) OR move ({ parent_id }). Exactly one per call.
 *          Move delegates to the `dms_move_node` RPC (role + same-project +
 *          folder + cycle guard). Rename updates name+slug with dedup.
 * DELETE — soft-delete the node + its whole subtree via
 *          `dms_soft_delete_subtree`; returns the count.
 *
 * Access: lead/editor/admin ("edit"). The RPCs re-check role via auth.uid().
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { moveNodeSchema, renameNodeSchema } from "@/lib/dms/schema"
import { dedupeName } from "@/lib/dms/slug"

const NODE_SELECT =
  "id, tenant_id, project_id, parent_id, node_type, name, slug, sort_order, " +
  "created_by, created_at, updated_at, deleted_at"

interface PgError {
  code?: string
  message?: string
}

/** Map the RPC's raised errcodes to HTTP responses. */
function mapRpcError(error: PgError) {
  switch (error.code) {
    case "42501":
      return apiError("forbidden", error.message ?? "Not allowed.", 403)
    case "P0002":
      return apiError("not_found", error.message ?? "Node not found.", 404)
    case "23514":
      return apiError(
        "conflict",
        error.message ?? "Invalid move (cycle, cross-project, or non-folder target).",
        409,
      )
    default:
      return apiError("internal_error", error.message ?? "RPC failed.", 500)
  }
}

function validateIds(projectId: string, nodeId: string) {
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(nodeId).success) {
    return apiError("validation_error", "Invalid node id.", 400, "nodeId")
  }
  return null
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; nodeId: string }> },
) {
  const { id: projectId, nodeId } = await context.params
  const idError = validateIds(projectId, nodeId)
  if (idError) return idError

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
  const raw = (body ?? {}) as Record<string, unknown>
  const hasName = "name" in raw
  const hasParent = "parent_id" in raw
  if (hasName === hasParent) {
    return apiError(
      "validation_error",
      "Provide exactly one of `name` (rename) or `parent_id` (move).",
      400,
    )
  }

  // --- Move ---------------------------------------------------------------
  if (hasParent) {
    const parsed = moveNodeSchema.safeParse(raw)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      return apiError("validation_error", first?.message ?? "Invalid parent_id.", 400, "parent_id")
    }
    const { data, error } = await supabase.rpc("dms_move_node", {
      p_node_id: nodeId,
      p_new_parent_id: parsed.data.parent_id,
    })
    if (error) return mapRpcError(error)
    return NextResponse.json({ node: data })
  }

  // --- Rename -------------------------------------------------------------
  const parsed = renameNodeSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError("validation_error", first?.message ?? "Invalid name.", 400, "name")
  }

  // Look up the node (RLS-scoped) to find its sibling group + confirm project.
  const { data: node, error: nodeErr } = await supabase
    .from("document_tree_nodes")
    .select("id, project_id, parent_id, slug, deleted_at")
    .eq("id", nodeId)
    .maybeSingle()
  if (nodeErr) return apiError("internal_error", nodeErr.message, 500)
  if (!node || node.deleted_at !== null || node.project_id !== projectId) {
    return apiError("not_found", "Node not found.", 404)
  }

  // Gather live sibling slugs (exclude self) for dedup.
  let siblingQuery = supabase
    .from("document_tree_nodes")
    .select("slug")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .neq("id", nodeId)
    .limit(5000)
  siblingQuery = node.parent_id
    ? siblingQuery.eq("parent_id", node.parent_id)
    : siblingQuery.is("parent_id", null)
  const { data: siblings, error: sibErr } = await siblingQuery
  if (sibErr) return apiError("internal_error", sibErr.message, 500)
  const existingSlugs = (siblings ?? []).map((s) => (s as { slug: string }).slug)

  const { name, slug } = dedupeName(parsed.data.name, existingSlugs)

  const { data, error } = await supabase
    .from("document_tree_nodes")
    .update({ name, slug })
    .eq("id", nodeId)
    .select(NODE_SELECT)
    .single()
  if (error) {
    if (error.code === "23505") {
      return apiError("conflict", "A node with that name already exists.", 409)
    }
    return apiError("update_failed", error.message, 500)
  }
  return NextResponse.json({ node: data })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; nodeId: string }> },
) {
  const { id: projectId, nodeId } = await context.params
  const idError = validateIds(projectId, nodeId)
  if (idError) return idError

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const { data, error } = await supabase.rpc("dms_soft_delete_subtree", {
    p_node_id: nodeId,
  })
  if (error) return mapRpcError(error)

  return NextResponse.json({ deleted: typeof data === "number" ? data : 0 })
}
