/**
 * PROJ-58 — GET /api/projects/[id]/graph
 *
 * Read-only, library-agnostic graph snapshot of the project.
 * Returns typed nodes + edges that any 2D/3D graph library can
 * consume. The MVP renders nothing — the UI slice will land in a
 * later batch with a chosen library (react-flow / cytoscape).
 */

import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { resolveProjectGraph } from "@/lib/project-graph/aggregate"

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

  const graph = await resolveProjectGraph({ supabase, projectId, tenantId })
  return NextResponse.json({ graph })
}
