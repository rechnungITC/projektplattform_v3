/**
 * PROJ-56 — GET /api/projects/[id]/readiness
 *
 * Returns the project-readiness snapshot consumed by the Project-
 * Room Readiness Checklist (and, in a follow-up slice, by PROJ-21
 * report snapshots so the report mirrors the in-app state).
 */

import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { resolveProjectReadiness } from "@/lib/project-readiness/aggregate"

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error
  const tenantId = (access.project as { tenant_id: string }).tenant_id

  const readiness = await resolveProjectReadiness({
    supabase,
    projectId,
    tenantId,
  })

  return NextResponse.json({ readiness })
}
