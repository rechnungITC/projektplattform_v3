import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"

// PROJ-10 — POST /api/projects/[id]/work-items/[wid]/copy
// Creates a fresh work-item in the same project carrying structural fields
// only: title (with " (Kopie)" suffix), description, kind. Does NOT carry
// status (resets to default), responsible_user_id, sprint_id, parent_id,
// dates, story points — per spec § "Copy does NOT carry: history,
// assignments, due dates".

interface Ctx {
  params: Promise<{ id: string; wid: string }>
}

export async function POST(_request: Request, ctx: Ctx) {
  const { id: projectId, wid } = await ctx.params
  if (!z.string().uuid().safeParse(wid).success) {
    return apiError("validation_error", "Invalid work-item id.", 400, "wid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const { data: original, error: readErr } = await supabase
    .from("work_items")
    .select("id, tenant_id, project_id, title, description, kind")
    .eq("project_id", projectId)
    .eq("id", wid)
    .maybeSingle()
  if (readErr) {
    return apiError("read_failed", readErr.message, 500)
  }
  if (!original) {
    return apiError("not_found", "Work item not found.", 404)
  }

  const { data: created, error: insertErr } = await supabase
    .from("work_items")
    .insert({
      tenant_id: original.tenant_id,
      project_id: original.project_id,
      title: `${original.title} (Kopie)`,
      description: original.description,
      kind: original.kind,
      created_by: userId,
    })
    .select()
    .single()

  if (insertErr) {
    if (insertErr.code === "42501") {
      return apiError(
        "forbidden",
        "Editor or lead role required to copy work items.",
        403
      )
    }
    return apiError("copy_failed", insertErr.message, 500)
  }

  return NextResponse.json({ work_item: created }, { status: 201 })
}
