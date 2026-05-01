import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"

// PROJ-21 § ST-03 — signed-URL redirect for the snapshot PDF.
//
// GET /api/projects/[id]/snapshots/[sid]/pdf
//
// The `reports` Storage bucket is private; signed URLs (5-min TTL)
// are issued via the service-role admin client only after the caller
// passes RLS + module gating. Direct bucket access from the browser
// is blocked by the storage RLS policy.

interface Ctx {
  params: Promise<{ id: string; sid: string }>
}

const SIGNED_URL_TTL_SECONDS = 300

export async function GET(_request: Request, ctx: Ctx) {
  const { id: projectId, sid: snapshotId } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error
  const tenantId = (access.project as { tenant_id: string }).tenant_id

  const moduleErr = await requireModuleActive(
    supabase,
    tenantId,
    "output_rendering",
    { intent: "read" },
  )
  if (moduleErr) return moduleErr

  const { data: snapshot, error: snapErr } = await supabase
    .from("report_snapshots")
    .select("id, project_id, pdf_storage_key, pdf_status")
    .eq("id", snapshotId)
    .eq("project_id", projectId)
    .maybeSingle<{
      id: string
      project_id: string
      pdf_storage_key: string | null
      pdf_status: string
    }>()
  if (snapErr) return apiError("internal_error", snapErr.message, 500)
  if (!snapshot) return apiError("not_found", "Snapshot not found.", 404)
  if (!snapshot.pdf_storage_key || snapshot.pdf_status !== "available") {
    return apiError(
      "pdf_not_available",
      "PDF is not available for this snapshot.",
      409,
    )
  }

  const admin = createAdminClient()
  const { data: signed, error: signErr } = await admin.storage
    .from("reports")
    .createSignedUrl(snapshot.pdf_storage_key, SIGNED_URL_TTL_SECONDS, {
      download: true,
    })
  if (signErr || !signed?.signedUrl) {
    return apiError(
      "signing_failed",
      signErr?.message ?? "Could not sign URL",
      500,
    )
  }

  return NextResponse.redirect(signed.signedUrl, 302)
}
