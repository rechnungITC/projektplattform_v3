import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"

/**
 * DELETE /api/dependencies/[depId]
 *
 * Tenant-level deletion. RLS (`is_tenant_member`) is the authoritative gate:
 * if the row's tenant is foreign to the caller it is invisible and the
 * delete affects 0 rows (the route still returns 204 — idempotent).
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ depId: string }> }
) {
  const { depId } = await context.params
  if (!z.string().uuid().safeParse(depId).success) {
    return apiError("validation_error", "Invalid dependency id.", 400, "depId")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { error } = await supabase
    .from("dependencies")
    .delete()
    .eq("id", depId)

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("delete_failed", error.message, 500)
  }
  return new NextResponse(null, { status: 204 })
}
