import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-118 (AC5) — lazy-seed the standard communication templates for the
// tenant (seed_communication_templates RPC; tenant-admin, idempotent).
export async function POST(
  _request: Request,
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

  const { data, error } = await supabase.rpc("seed_communication_templates", {
    p_tenant_id: access.project.tenant_id,
  })
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Tenant admin required.", 403)
    return apiError("seed_failed", error.message, 500)
  }
  return NextResponse.json({ seeded: data })
}
