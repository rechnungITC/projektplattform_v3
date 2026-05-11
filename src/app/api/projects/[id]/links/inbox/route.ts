import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import {
  enrichWorkItemLinks,
  parseUuidParam,
  toInboxItem,
} from "@/app/api/projects/[id]/work-item-links/_helpers"
import type { LinkInboxFilter, WorkItemLink } from "@/types/work-item-link"

const filterSchema = z.enum(["pending", "approved", "rejected", "all"])

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params
  const projectErr = parseUuidParam(projectId, "id")
  if (projectErr) return projectErr

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "manage_members")
  if (access.error) return access.error

  const url = new URL(request.url)
  const rawFilter = url.searchParams.get("filter") ?? "pending"
  const parsedFilter = filterSchema.safeParse(rawFilter)
  if (!parsedFilter.success) {
    return apiError("validation_error", "Invalid filter.", 400, "filter")
  }
  const filter = parsedFilter.data as LinkInboxFilter
  const search = (url.searchParams.get("q") ?? "").trim().toLowerCase()

  let query = supabase
    .from("work_item_links")
    .select("*")
    .eq("approval_project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(100)

  if (filter !== "all") {
    query = query.eq("approval_state", filter)
  }

  const { data, error } = await query
  if (error) return apiError("list_failed", error.message, 500)

  const enriched = await enrichWorkItemLinks(
    supabase,
    (data ?? []) as WorkItemLink[],
    userId,
    access.project.tenant_id,
  )

  const items = enriched.map(toInboxItem).filter((item) => {
    if (!search) return true
    const haystack = [
      item.source.title,
      item.source.project_name,
      item.target?.title,
      item.target?.project_name,
      item.target_project?.project_name,
      item.created_by_name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
    return haystack.includes(search)
  })

  return NextResponse.json({ items })
}
