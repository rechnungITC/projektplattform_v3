import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"

// PROJ-10 — POST /api/projects/[id]/stakeholders/[sid]/copy
// Creates a fresh stakeholder in the same project carrying structural fields
// (kind, origin, role_key, org_unit, influence, impact). Does NOT carry
// Class-3 personal data (contact_email, contact_phone, linked_user_id, notes)
// — that's the spec's "structural fields only" rule applied to this entity.
// Name gets " (Kopie)" suffix. Status defaults to active.

interface Ctx {
  params: Promise<{ id: string; sid: string }>
}

export async function POST(_request: Request, ctx: Ctx) {
  const { id: projectId, sid } = await ctx.params
  if (!z.string().uuid().safeParse(sid).success) {
    return apiError("validation_error", "Invalid stakeholder id.", 400, "sid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const { data: original, error: readErr } = await supabase
    .from("stakeholders")
    .select(
      "id, tenant_id, project_id, kind, origin, name, role_key, org_unit, influence, impact"
    )
    .eq("project_id", projectId)
    .eq("id", sid)
    .maybeSingle()
  if (readErr) {
    return apiError("read_failed", readErr.message, 500)
  }
  if (!original) {
    return apiError("not_found", "Stakeholder not found.", 404)
  }

  const { data: created, error: insertErr } = await supabase
    .from("stakeholders")
    .insert({
      tenant_id: original.tenant_id,
      project_id: original.project_id,
      kind: original.kind,
      origin: original.origin,
      name: `${original.name} (Kopie)`,
      role_key: original.role_key,
      org_unit: original.org_unit,
      influence: original.influence,
      impact: original.impact,
      created_by: userId,
    })
    .select()
    .single()

  if (insertErr) {
    if (insertErr.code === "42501") {
      return apiError(
        "forbidden",
        "Editor or lead role required to copy stakeholders.",
        403
      )
    }
    return apiError("copy_failed", insertErr.message, 500)
  }

  return NextResponse.json({ stakeholder: created }, { status: 201 })
}
