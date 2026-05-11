import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { parseUuidParam } from "@/app/api/projects/[id]/work-item-links/_helpers"
import type { WorkItemLink } from "@/types/work-item-link"

export async function DELETE(
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

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const { data: link, error: readErr } = await supabase
    .from("work_item_links")
    .select("*")
    .eq("id", linkId)
    .or(`from_project_id.eq.${projectId},to_project_id.eq.${projectId}`)
    .maybeSingle<WorkItemLink>()

  if (readErr) return apiError("internal_error", readErr.message, 500)
  if (!link) return apiError("not_found", "Link not found.", 404)

  const { error } = await supabase
    .from("work_item_links")
    .delete()
    .eq("id", link.id)

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("delete_failed", error.message, 500)
  }

  return new Response(null, { status: 204 })
}
