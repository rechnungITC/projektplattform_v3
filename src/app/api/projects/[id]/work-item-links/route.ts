import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import {
  classifyProjectRelation,
  createLinkSchema,
  enrichWorkItemLinks,
  normalizeCreateLinkInput,
  parseUuidParam,
  readProject,
  readWorkItemInProject,
  type WorkItemLinkWorkItemRow,
} from "@/app/api/projects/[id]/work-item-links/_helpers"
import { canonicalLinkType } from "@/lib/work-items/link-types"
import type { WorkItemLink } from "@/types/work-item-link"

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params
  const idErr = parseUuidParam(projectId, "id")
  if (idErr) return idErr

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be JSON.", 400)
  }

  const parsed = createLinkSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid body.",
      400,
      first?.path?.[0]?.toString(),
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const sourceRes = await readWorkItemInProject(
    supabase,
    projectId,
    parsed.data.from_work_item_id,
  )
  if (sourceRes.error) return sourceRes.error
  if (!sourceRes.row) return apiError("not_found", "Work item not found.", 404)
  const source = sourceRes.row

  let targetItem: WorkItemLinkWorkItemRow | null = null
  let targetProjectId = parsed.data.to_project_id ?? null
  if (parsed.data.to_work_item_id) {
    const { data: target, error: targetErr } = await supabase
      .from("work_items")
      .select("id, tenant_id, project_id, kind, title, status, is_deleted")
      .eq("id", parsed.data.to_work_item_id)
      .maybeSingle<WorkItemLinkWorkItemRow>()
    if (targetErr) return apiError("internal_error", targetErr.message, 500)
    if (!target || target.is_deleted) {
      return apiError("invalid_target", "Target work item not found.", 422, "to_work_item_id")
    }
    targetItem = target
    targetProjectId = target.project_id
  }

  if (!targetProjectId) {
    return apiError("invalid_target", "Target project is required.", 422, "to_project_id")
  }

  const targetProjectRes = await readProject(supabase, targetProjectId)
  if (targetProjectRes.error) {
    return apiError("invalid_target", "Target project not found.", 422, "to_project_id")
  }
  if (!targetProjectRes.row) {
    return apiError("invalid_target", "Target project not found.", 422, "to_project_id")
  }
  const targetProject = targetProjectRes.row

  if (source.tenant_id !== targetProject.tenant_id) {
    return apiError("invalid_target", "Cross-tenant links are not allowed.", 422, "to_project_id")
  }
  if (targetItem && source.tenant_id !== targetItem.tenant_id) {
    return apiError("invalid_target", "Cross-tenant links are not allowed.", 422, "to_work_item_id")
  }
  if (!targetItem && canonicalLinkType(parsed.data.link_type).type !== "delivers") {
    return apiError(
      "invalid_link_type",
      "Whole-project links must use delivers.",
      422,
      "link_type",
    )
  }

  const relation = await classifyProjectRelation(supabase, source.project_id, targetProject.id)
  const approvalState = relation === "cross" ? "pending" : "approved"
  const approvalProjectId = approvalState === "pending" ? targetProject.id : null

  let insertPayload: Omit<WorkItemLink, "id" | "created_at" | "updated_at">
  try {
    insertPayload = normalizeCreateLinkInput({
      source,
      targetItem,
      targetProject,
      linkType: parsed.data.link_type,
      lagDays: parsed.data.lag_days ?? null,
      approvalState,
      approvalProjectId,
      userId,
    })
  } catch {
    return apiError(
      "invalid_link_type",
      "Whole-project links must use canonical delivers.",
      422,
      "link_type",
    )
  }

  const { data: row, error } = await supabase
    .from("work_item_links")
    .insert(insertPayload)
    .select("*")
    .single<WorkItemLink>()

  if (error) {
    if (error.code === "23505") {
      return apiError("already_exists", "This link already exists.", 409)
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    if (error.code === "23503" || error.code === "22023") {
      return apiError("invalid_reference", error.message, 422)
    }
    if (error.code === "42501") {
      return apiError("forbidden", "Not allowed to create this link.", 403)
    }
    return apiError("create_failed", error.message, 500)
  }

  const [link] = await enrichWorkItemLinks(supabase, [row], userId, source.tenant_id)
  return NextResponse.json({ link, approval_state: row.approval_state }, { status: 201 })
}
