import { NextResponse } from "next/server"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

import { idSchema } from "../_schema"

// PROJ-45-β — GET /api/projects/[id]/construction-defects/summary
//
// Totals plus per-trade counters for the list header (AC-45β.16 / AC-45β.17).
// Backed by `construction_defect_summary`, which is SECURITY INVOKER: the
// aggregate is computed under the caller's own RLS, so counters can never reveal
// defects whose rows are hidden (AC-45βH-1, aggregate-leak probe in the pentest).
// It must therefore be called with the session-bound client — a service-role
// call here would bypass every gate above it.
//
// NOTE: `summary` is a RESERVED defect id. Next.js gives the static segment
// priority over the sibling `[did]` dynamic segment, so this route always wins;
// nothing must ever be addressed as a defect literally named "summary".

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  if (!idSchema.safeParse(projectId).success) {
    return apiError("invalid_id", "Malformed project id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "construction"
  )
  if (moduleDenial) return moduleDenial

  const { data, error } = await supabase.rpc("construction_defect_summary", {
    p_project_id: projectId,
  })
  if (error) return apiError("summary_failed", error.message, 500)

  return NextResponse.json({ summary: data ?? null })
}
