/**
 * PROJ-50 — list Jira sync conflicts for a project.
 *
 *   GET /api/projects/[id]/jira/conflicts?resolution=pending|v3_wins|jira_wins|manual
 *
 * Project members may read (RLS-gated). Newest-first, bounded.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

const RESOLUTIONS = ["pending", "v3_wins", "jira_wins", "manual"] as const
const resolutionSchema = z.enum(RESOLUTIONS).optional()

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "id must be a UUID.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const url = new URL(request.url)
  const parsed = resolutionSchema.safeParse(
    url.searchParams.get("resolution") ?? undefined,
  )
  if (!parsed.success) {
    return apiError("validation_error", "Invalid resolution filter.", 400, "resolution")
  }

  let query = supabase
    .from("jira_sync_conflicts")
    .select(
      "id, tenant_id, project_id, work_item_id, external_ref_id, field, v3_value, jira_value, resolution, detected_at, resolved_by, resolved_at",
    )
    .eq("project_id", projectId)
    .order("detected_at", { ascending: false })
    .limit(200)

  if (parsed.data) query = query.eq("resolution", parsed.data)

  const { data, error } = await query
  if (error) return apiError("read_failed", error.message, 500)

  return NextResponse.json({ conflicts: data ?? [] }, { status: 200 })
}
