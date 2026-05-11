import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import {
  enrichWorkItemLinks,
  parseUuidParam,
} from "@/app/api/projects/[id]/work-item-links/_helpers"
import type { WorkItemLink } from "@/types/work-item-link"

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; lid: string }> },
) {
  const { id: projectId, lid: linkId } = await context.params
  const projectErr = parseUuidParam(projectId, "id")
  if (projectErr) return projectErr
  const linkErr = parseUuidParam(linkId, "lid")
  if (linkErr) return linkErr

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "manage_members")
  if (access.error) return access.error

  const { data: current, error: readErr } = await supabase
    .from("work_item_links")
    .select("*")
    .eq("id", linkId)
    .eq("approval_project_id", projectId)
    .maybeSingle<WorkItemLink>()

  if (readErr) return apiError("internal_error", readErr.message, 500)
  if (!current) return apiError("not_found", "Link not found.", 404)
  if (current.approval_state !== "pending") {
    return apiError("conflict", "Link is not pending approval.", 409)
  }

  const { data: row, error } = await supabase
    .from("work_item_links")
    .update({
      approval_state: "rejected",
      approved_by: null,
      approved_at: null,
    })
    .eq("id", linkId)
    .select("*")
    .single<WorkItemLink>()

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("reject_failed", error.message, 500)
  }

  const [link] = await enrichWorkItemLinks(supabase, [row], userId, row.tenant_id)
  return NextResponse.json({ link })
}
