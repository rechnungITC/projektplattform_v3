import { NextResponse } from "next/server"

import { renderSnapshotPdf } from "@/lib/reports/puppeteer-render"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"

// PROJ-21 § ST-03 / Edge Cases — re-render the PDF for an existing
// snapshot whose `pdf_status='failed'`. Snapshot stays at the same
// version; only `pdf_storage_key` and `pdf_status` are updated.
//
// POST /api/projects/[id]/snapshots/[sid]/render-pdf

interface Ctx {
  params: Promise<{ id: string; sid: string }>
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId, sid: snapshotId } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error
  const tenantId = (access.project as { tenant_id: string }).tenant_id

  const moduleErr = await requireModuleActive(
    supabase,
    tenantId,
    "output_rendering",
    { intent: "write" },
  )
  if (moduleErr) return moduleErr

  const { data: snapshot, error: snapErr } = await supabase
    .from("report_snapshots")
    .select("id, tenant_id, project_id, pdf_status")
    .eq("id", snapshotId)
    .eq("project_id", projectId)
    .maybeSingle<{
      id: string
      tenant_id: string
      project_id: string
      pdf_status: string
    }>()
  if (snapErr) return apiError("internal_error", snapErr.message, 500)
  if (!snapshot) return apiError("not_found", "Snapshot not found.", 404)

  const origin = new URL(request.url).origin
  const cookieHeader = request.headers.get("cookie")

  try {
    const result = await renderSnapshotPdf({
      origin,
      snapshotId: snapshot.id,
      tenantId: snapshot.tenant_id,
      projectId,
      cookieHeader,
    })
    await updateSnapshotPdfStatus(snapshot.id, {
      pdf_storage_key: result.storageKey,
      pdf_status: "available",
    })
    return new NextResponse(null, { status: 204 })
  } catch (renderErr) {
    console.error(
      "[PROJ-21] PDF retry failed",
      JSON.stringify({
        snapshotId: snapshot.id,
        error:
          renderErr instanceof Error ? renderErr.message : String(renderErr),
      }),
    )
    await updateSnapshotPdfStatus(snapshot.id, { pdf_status: "failed" })
    return apiError(
      "render_failed",
      renderErr instanceof Error ? renderErr.message : "Render failed",
      500,
    )
  }
}

async function updateSnapshotPdfStatus(
  snapshotId: string,
  updates: { pdf_status: "available" | "failed"; pdf_storage_key?: string },
) {
  const admin = createAdminClient()
  const { error } = await admin
    .from("report_snapshots")
    .update(updates)
    .eq("id", snapshotId)
  if (error) {
    throw new Error(`snapshot pdf status update failed: ${error.message}`)
  }
}
