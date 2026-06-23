import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-129 — "who can see this, and why?" matrix for a protected object.
//
// GET /api/projects/[id]/access-explain?objectType=project|phase|work_item&objectId=<uuid>
//   or  ?level=standard|confidential|strict   (level takes precedence)
//
// Resolves the object's confidentiality_level (or uses the explicit level),
// then calls ma_access_explain(), which mirrors the can_access_classified gate
// rule for every relevant user (member / advisor / mandate / NDA / clearance)
// and reports has_access + reason. Manager-gated inside the RPC. Read-only,
// never a second gate.

const OBJECT_TYPES = ["project", "phase", "work_item"] as const
type ObjectType = (typeof OBJECT_TYPES)[number]
const LEVELS = ["standard", "confidential", "strict"] as const

const TABLE_BY_TYPE: Record<ObjectType, string> = {
  project: "projects",
  phase: "phases",
  work_item: "work_items",
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const url = new URL(request.url)

  // explicit level wins; otherwise resolve from the object.
  let level = url.searchParams.get("level") ?? undefined
  let objectType: ObjectType = "project"
  let objectId = projectId

  if (level) {
    if (!LEVELS.includes(level as (typeof LEVELS)[number])) {
      return apiError(
        "validation_error",
        "level must be standard, confidential, or strict.",
        400,
        "level"
      )
    }
  } else {
    objectType = (url.searchParams.get("objectType") ?? "project") as ObjectType
    if (!OBJECT_TYPES.includes(objectType)) {
      return apiError(
        "validation_error",
        "objectType must be project, phase, or work_item.",
        400,
        "objectType"
      )
    }
    objectId = url.searchParams.get("objectId") ?? projectId
    if (!z.string().uuid().safeParse(objectId).success) {
      return apiError("validation_error", "Invalid objectId.", 400, "objectId")
    }

    let query = supabase
      .from(TABLE_BY_TYPE[objectType])
      .select("confidentiality_level")
      .eq("id", objectId)
    if (objectType !== "project") {
      query = query.eq("project_id", projectId)
    }
    const { data: obj, error: objError } = await query.maybeSingle()
    if (objError) return apiError("lookup_failed", objError.message, 500)
    if (!obj) return apiError("not_found", "Object not found.", 404)
    level = (obj as { confidentiality_level: string }).confidentiality_level
  }

  const { data, error } = await supabase.rpc("ma_access_explain", {
    p_project_id: projectId,
    p_level: level,
  })

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Not authorized to view the access overview.",
        403
      )
    }
    return apiError("explain_failed", error.message, 500)
  }

  return NextResponse.json({
    object_type: objectType,
    object_id: objectId,
    confidentiality_level: level,
    entries: data ?? [],
  })
}
