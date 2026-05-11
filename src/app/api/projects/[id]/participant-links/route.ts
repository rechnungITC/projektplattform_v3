/**
 * PROJ-57 — GET /api/projects/[id]/participant-links
 *
 * Returns the reconciled list of people involved in this project,
 * with their four roles (tenant-member / project-member /
 * stakeholder / resource) and rate-source classification.
 *
 * Class-3 masking (PROJ-57-δ) is out of scope for the MVP — the
 * route returns rate values verbatim. The FE consumer must respect
 * the existing role-rate / cost-line permission semantics when
 * rendering. Tightening to permission-aware masking is a follow-up.
 */

import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { resolveProjectParticipantLinks } from "@/lib/participant-links/aggregate"

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

  const snapshot = await resolveProjectParticipantLinks({
    supabase,
    projectId,
    tenantId,
  })

  return NextResponse.json({ participant_links: snapshot })
}
