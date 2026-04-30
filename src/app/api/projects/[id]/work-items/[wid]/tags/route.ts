import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import { applyTriggerForNewTag } from "@/lib/compliance/trigger"
import type { ComplianceTag, WorkItemTagRow } from "@/lib/compliance/types"

const attachSchema = z.object({
  tag_id: z.string().uuid(),
})

function validateIds(projectId: string, workItemId: string) {
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(workItemId).success) {
    return apiError("validation_error", "Invalid work item id.", 400, "wid")
  }
  return null
}

// -----------------------------------------------------------------------------
// GET /api/projects/[id]/work-items/[wid]/tags
//   List all compliance tags attached to a work item, joined with the
//   tag master data so the UI can render labels in one round-trip.
// -----------------------------------------------------------------------------
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; wid: string }> }
) {
  const { id: projectId, wid: workItemId } = await context.params
  const idErr = validateIds(projectId, workItemId)
  if (idErr) return idErr

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data, error } = await supabase
    .from("work_item_tags")
    .select("*, compliance_tags!inner(*)")
    .eq("work_item_id", workItemId)
    .order("created_at", { ascending: true })

  if (error) return apiError("list_failed", error.message, 500)

  type Joined = WorkItemTagRow & {
    compliance_tags: ComplianceTag | ComplianceTag[]
  }
  const rows = ((data ?? []) as unknown as Joined[]).map((r) => {
    const tag = Array.isArray(r.compliance_tags) ? r.compliance_tags[0] : r.compliance_tags
    const { compliance_tags: _omit, ...link } = r
    void _omit
    return { link: link as WorkItemTagRow, tag }
  })

  return NextResponse.json({ rows })
}

// -----------------------------------------------------------------------------
// POST /api/projects/[id]/work-items/[wid]/tags
//   Attach a compliance tag and fire the "created"-phase trigger:
//   - inserts compliance_trigger_log row (UNIQUE-gated for idempotency)
//   - creates child work-item(s) per template
//   - creates work_item_documents row(s) per template
// -----------------------------------------------------------------------------
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; wid: string }> }
) {
  const { id: projectId, wid: workItemId } = await context.params
  const idErr = validateIds(projectId, workItemId)
  if (idErr) return idErr

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be JSON.", 400)
  }
  const parsed = attachSchema.safeParse(body)
  if (!parsed.success) {
    const f = parsed.error.issues[0]
    return apiError(
      "validation_error",
      f?.message ?? "Invalid body.",
      400,
      f?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // Resolve tenant_id from the work-item (RLS still applies → 404 leak-safe).
  const { data: wi, error: wiErr } = await supabase
    .from("work_items")
    .select("id, tenant_id, project_id")
    .eq("id", workItemId)
    .eq("project_id", projectId)
    .maybeSingle()
  if (wiErr) return apiError("internal_error", wiErr.message, 500)
  if (!wi) return apiError("not_found", "Work item not found.", 404)

  // Insert the link row. UNIQUE(work_item_id, tag_id) prevents duplicates.
  const { data: link, error: linkErr } = await supabase
    .from("work_item_tags")
    .insert({
      tenant_id: wi.tenant_id,
      work_item_id: workItemId,
      tag_id: parsed.data.tag_id,
      created_by: userId,
    })
    .select()
    .single()

  if (linkErr) {
    if (linkErr.code === "23505") {
      return apiError("already_attached", "Tag is already attached to this work item.", 409)
    }
    if (linkErr.code === "23503") {
      return apiError("invalid_reference", "Tag does not exist or is not in this tenant.", 422, "tag_id")
    }
    if (linkErr.code === "42501") return apiError("forbidden", "Editor or lead role required.", 403)
    return apiError("attach_failed", linkErr.message, 500)
  }

  // Fire the "created"-phase trigger. We let any errors bubble up — the
  // link row is already committed (autocommit), but the idempotency key
  // means a retried POST will see "already_attached" 409 and the trigger
  // log itself prevents double-firing.
  let childWorkItemIds: string[] = []
  let documentIds: string[] = []
  try {
    const result = await applyTriggerForNewTag({
      supabase,
      tenantId: wi.tenant_id,
      projectId,
      workItemId,
      tagId: parsed.data.tag_id,
      userId,
    })
    childWorkItemIds = result.childWorkItemIds
    documentIds = result.documentIds
  } catch (err) {
    // The trigger errors are non-fatal for the attach itself — log and
    // return 201 with a `trigger_error` field so the UI can surface
    // a soft-warning toast without losing the tag attachment.
    return NextResponse.json(
      {
        link,
        childWorkItemIds: [],
        documentIds: [],
        trigger_error: err instanceof Error ? err.message : "Unknown trigger error.",
      },
      { status: 201 }
    )
  }

  return NextResponse.json(
    { link, childWorkItemIds, documentIds },
    { status: 201 }
  )
}
