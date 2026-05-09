import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { isSprintAssignableKind } from "@/lib/work-items/sprint-assignment"

/**
 * PROJ-25b — Bulk Sprint Assignment.
 *
 * One transaction-like call to attach (or detach) multiple work items to a
 * sprint. Designed for the multi-select Drag-and-Drop flow on the Backlog
 * page: a single drag of N selected sprint-assignable items should land as one server-side
 * action — partial success would leave the UI half-applied and the audit
 * log noisy.
 *
 * Atomicity: a single `UPDATE … WHERE id = ANY(:ids) AND project_id = :pid`
 * either updates exactly the supplied IDs or returns 422 without changing
 * anything. RLS still gates writes per row; the WHERE on `project_id`
 * defends against cross-project ID smuggling on top of RLS.
 */

const MAX_BULK_ITEMS = 50

const schema = z.object({
  work_item_ids: z
    .array(z.string().uuid())
    .min(1, "Provide at least one work item id.")
    .max(MAX_BULK_ITEMS, `Cannot bulk-update more than ${MAX_BULK_ITEMS} items.`),
  sprint_id: z.string().uuid().nullable(),
})

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be JSON.", 400)
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const f = parsed.error.issues[0]
    return apiError(
      "validation_error",
      f?.message ?? "Invalid body.",
      400,
      f?.path?.[0]?.toString()
    )
  }

  // De-duplicate IDs — sending the same ID twice in a multi-select drag is
  // legal-but-pointless and would inflate the count check.
  const ids = Array.from(new Set(parsed.data.work_item_ids))

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // Defense-in-depth: surface a clean 403 before relying on RLS row-level
  // filters. Caller must hold an edit role on the project.
  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  // Sprint guard — same shape as the single-item route. Sprint must exist,
  // belong to this project, and not be closed.
  if (parsed.data.sprint_id) {
    const { data: sprint, error: sprintErr } = await supabase
      .from("sprints")
      .select("id, project_id, state")
      .eq("id", parsed.data.sprint_id)
      .maybeSingle()
    if (sprintErr) return apiError("internal_error", sprintErr.message, 500)
    if (!sprint) {
      return apiError("invalid_sprint", "Sprint not found.", 422, "sprint_id")
    }
    if (sprint.project_id !== projectId) {
      return apiError(
        "invalid_sprint",
        "Sprint is not in this project.",
        422,
        "sprint_id"
      )
    }
    if (sprint.state === "closed") {
      return apiError(
        "sprint_closed",
        "Cannot assign work items to a closed sprint.",
        422,
        "sprint_id"
      )
    }
  }

  // Pre-flight match check: every supplied ID must resolve to a work item in
  // this project under the user's RLS view. If any ID is missing (deleted,
  // foreign tenant, wrong project, or not sprint-assignable) we abort without writing.
  // Cheaper than running the UPDATE blind and then having to roll back.
  const { data: matched, error: matchErr } = await supabase
    .from("work_items")
    .select("id, kind")
    .in("id", ids)
    .eq("project_id", projectId)
  if (matchErr) return apiError("internal_error", matchErr.message, 500)

  const matchedIds = new Set((matched ?? []).map((row) => row.id))
  const missing = ids.filter((id) => !matchedIds.has(id))
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: "items_not_found",
          message: "One or more work items are missing or outside this project.",
          field: "work_item_ids",
        },
        failed_ids: missing,
      },
      { status: 422 }
    )
  }

  // PROJ-60: Stories, Tasks and Bugs are sprint-droppable. Frontend gates the
  // drag-handle, but we double-check server-side for API callers and stale UIs.
  const wrongKind = (matched ?? [])
    .filter((row) => !isSprintAssignableKind(row.kind))
    .map((row) => row.id)
  if (wrongKind.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_kind",
          message: "Only stories, tasks and bugs can be assigned to a sprint.",
          field: "work_item_ids",
        },
        failed_ids: wrongKind,
      },
      { status: 422 }
    )
  }

  // Atomic update. RLS still gates per-row; if a row's update is denied the
  // returned `data` array is shorter than `ids` and we surface that as 403.
  const { data: updated, error: updateErr } = await supabase
    .from("work_items")
    .update({ sprint_id: parsed.data.sprint_id })
    .in("id", ids)
    .eq("project_id", projectId)
    .select()
  if (updateErr) {
    if (updateErr.code === "23514")
      return apiError("constraint_violation", updateErr.message, 422)
    if (updateErr.code === "23503")
      return apiError("invalid_reference", updateErr.message, 422)
    if (updateErr.code === "42501")
      return apiError("forbidden", "Not allowed.", 403)
    return apiError("update_failed", updateErr.message, 500)
  }
  if (!updated || updated.length !== ids.length) {
    return apiError(
      "forbidden",
      "Not all work items could be updated (RLS).",
      403
    )
  }

  return NextResponse.json({ updated: updated.length, work_items: updated })
}
