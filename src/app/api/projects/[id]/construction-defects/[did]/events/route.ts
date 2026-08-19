import { NextResponse } from "next/server"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"

import { DEFECT_EVENT_SELECT, idSchema } from "../../_schema"

// PROJ-45-β — the immutable history of one defect (AC-45β.12).
//
// `construction_defect_events` is append-only in normal operation (UPDATE and
// DELETE raise 42501) and stays OUT of the three audit registers on purpose: it
// IS the protocol, and a second recording would duplicate it (PROJ-130-β ruled
// out double logging for exactly this reason).
//
// The defect is resolved against THIS project first, so a valid defect id from
// another project answers 404 rather than returning its history under the wrong
// project's URL.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; did: string }> }
) {
  const { id: projectId, did } = await params
  if (!idSchema.safeParse(projectId).success || !idSchema.safeParse(did).success) {
    return apiError("invalid_id", "Malformed id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  // Read intent: module off -> answer as if the surface did not exist.
  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "construction"
  )
  if (moduleDenial) return moduleDenial

  const { data: defect, error: defectError } = await supabase
    .from("construction_defects")
    .select("id")
    .eq("id", did)
    .eq("project_id", projectId)
    .maybeSingle()

  if (defectError) return apiError("list_failed", defectError.message, 500)
  if (!defect) return apiError("not_found", "Construction defect not found.", 404)

  const { data, error } = await supabase
    .from("construction_defect_events")
    .select(DEFECT_EVENT_SELECT)
    .eq("defect_id", did)
    .order("created_at", { ascending: true })
    .limit(1000)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ events: data ?? [] })
}
