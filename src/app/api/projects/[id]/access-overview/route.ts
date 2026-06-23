import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-100b — "who can see this?" overview for a protected object.
//
// GET /api/projects/[id]/access-overview?objectType=project|phase|work_item&objectId=<uuid>
//
// Resolves the object's confidentiality_level, then calls who_can_access(),
// which mirrors the can_access_classified gate predicate exactly (no second
// gate). Manager-gated inside the RPC. Read-only. objectType/objectId default
// to the project itself.

const OBJECT_TYPES = ["project", "phase", "work_item"] as const
type ObjectType = (typeof OBJECT_TYPES)[number]

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
  const objectType = (url.searchParams.get("objectType") ??
    "project") as ObjectType
  if (!OBJECT_TYPES.includes(objectType)) {
    return apiError(
      "validation_error",
      "objectType must be project, phase, or work_item.",
      400,
      "objectType"
    )
  }
  const objectId = url.searchParams.get("objectId") ?? projectId
  if (!z.string().uuid().safeParse(objectId).success) {
    return apiError("validation_error", "Invalid objectId.", 400, "objectId")
  }

  // Resolve the object's confidentiality_level within this project/tenant.
  // (RLS additionally guards the read; a hidden object yields not-found.)
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

  const level = (obj as { confidentiality_level: string }).confidentiality_level

  const { data, error } = await supabase.rpc("who_can_access", {
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
    return apiError("overview_failed", error.message, 500)
  }

  return NextResponse.json({
    object_type: objectType,
    object_id: objectId,
    confidentiality_level: level,
    entries: data ?? [],
  })
}
