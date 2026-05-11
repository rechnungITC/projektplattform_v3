import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import {
  enrichWorkItemLinks,
  parseUuidParam,
  readWorkItemInProject,
} from "@/app/api/projects/[id]/work-item-links/_helpers"
import type { WorkItemLink } from "@/types/work-item-link"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; wid: string }> },
) {
  const { id: projectId, wid: workItemId } = await context.params
  const projectErr = parseUuidParam(projectId, "id")
  if (projectErr) return projectErr
  const itemErr = parseUuidParam(workItemId, "wid")
  if (itemErr) return itemErr

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const itemRes = await readWorkItemInProject(supabase, projectId, workItemId)
  if (itemRes.error) return itemRes.error

  const { data, error } = await supabase
    .from("work_item_links")
    .select("*")
    .or(`from_work_item_id.eq.${workItemId},to_work_item_id.eq.${workItemId}`)
    .order("created_at", { ascending: false })

  if (error) return apiError("list_failed", error.message, 500)

  const links = await enrichWorkItemLinks(
    supabase,
    (data ?? []) as WorkItemLink[],
    userId,
    access.project.tenant_id,
  )

  return NextResponse.json({
    outgoing: links.filter((link) => link.from_work_item_id === workItemId),
    incoming: links.filter((link) => link.to_work_item_id === workItemId),
    pending_approval: links.filter(
      (link) =>
        link.approval_state === "pending" &&
        link.approval_project_id === projectId &&
        (link.from_work_item_id === workItemId || link.to_work_item_id === workItemId),
    ),
  })
}
