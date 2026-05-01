import { NextResponse } from "next/server"
import { z } from "zod"

import { aggregateSnapshotData } from "@/lib/reports/aggregate-snapshot-data"
import { renderSnapshotPdf } from "@/lib/reports/puppeteer-render"
import type {
  ReportSnapshot,
  SnapshotKind,
  SnapshotListItem,
} from "@/lib/reports/types"
import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../_lib/route-helpers"

// PROJ-21 — Snapshot collection endpoint.
// GET  /api/projects/[id]/snapshots      → list, view-access
// POST /api/projects/[id]/snapshots      → create, edit-access

const createSchema = z.object({
  kind: z.enum(["status_report", "executive_summary"]),
  ki_summary_text: z.string().trim().max(1000).optional(),
  manual_summary: z.string().trim().max(2000).optional(),
})

const SELECT_LIST = `
  id, kind, version, generated_at, generated_by, content, pdf_status,
  ki_summary_classification
` as const

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

  const moduleErr = await requireModuleActive(
    supabase,
    tenantId,
    "output_rendering",
    { intent: "read" },
  )
  if (moduleErr) return moduleErr

  const { data: rows, error: listError } = await supabase
    .from("report_snapshots")
    .select(SELECT_LIST)
    .eq("project_id", projectId)
    .order("generated_at", { ascending: false })
    .limit(100)
  if (listError) {
    return apiError("internal_error", listError.message, 500)
  }

  const userIds = Array.from(
    new Set((rows ?? []).map((r) => r.generated_by as string).filter(Boolean)),
  )
  const userMap = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, email")
      .in("user_id", userIds)
    for (const p of profiles ?? []) {
      const name =
        (p.display_name as string | null) ?? (p.email as string | null) ?? "—"
      userMap.set(p.user_id as string, name)
    }
  }

  const snapshots: SnapshotListItem[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as SnapshotKind,
    version: r.version as number,
    generated_at: r.generated_at as string,
    generated_by_name:
      userMap.get(r.generated_by as string) ??
      ((r.content as { generated_by_name?: string } | null)?.generated_by_name ??
        "—"),
    has_ki_summary:
      Boolean((r.content as { ki_summary?: unknown } | null)?.ki_summary) ||
      Boolean(r.ki_summary_classification),
    pdf_status: r.pdf_status as SnapshotListItem["pdf_status"],
  }))

  return NextResponse.json({ snapshots })
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params
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

  let body: z.infer<typeof createSchema>
  try {
    body = createSchema.parse(await request.json())
  } catch (err) {
    return apiError(
      "invalid_request",
      err instanceof Error ? err.message : "Invalid body",
      400,
    )
  }

  // Resolve next version per (project, kind).
  const { data: latest } = await supabase
    .from("report_snapshots")
    .select("version")
    .eq("project_id", projectId)
    .eq("kind", body.kind)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextVersion = ((latest?.version as number | undefined) ?? 0) + 1

  // Generator display name for the frozen header.
  const { data: actorProfile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("user_id", userId)
    .maybeSingle<{ display_name: string | null; email: string | null }>()
  const generatorDisplayName =
    actorProfile?.display_name ?? actorProfile?.email ?? "Unbekannt"

  let aggregate
  try {
    aggregate = await aggregateSnapshotData(
      {
        supabase,
        projectId,
        generatorUserId: userId,
        generatorDisplayName,
        manualSummary: body.manual_summary ?? null,
        kiSummary: body.ki_summary_text
          ? {
              text: body.ki_summary_text,
              classification: 2,
              provider: "user-edited",
            }
          : null,
      },
      body.kind,
    )
  } catch (err) {
    return apiError(
      "aggregate_failed",
      err instanceof Error ? err.message : "Snapshot aggregation failed",
      500,
    )
  }

  // Persist the frozen snapshot. UNIQUE(project_id, kind, version)
  // surfaces concurrent-create races as 23505 → 409 retry.
  const { data: insertedRaw, error: insertErr } = await supabase
    .from("report_snapshots")
    .insert({
      tenant_id: aggregate.tenantId,
      project_id: projectId,
      kind: body.kind,
      version: nextVersion,
      generated_by: userId,
      content: aggregate.content,
      pdf_status: "pending",
      ki_summary_classification: aggregate.content.ki_summary?.classification,
      ki_provider: aggregate.content.ki_summary?.provider,
    })
    .select(SELECT_LIST + ", tenant_id, project_id, pdf_storage_key, ki_provider")
    .single()
  if (insertErr || !insertedRaw) {
    if (insertErr?.code === "23505") {
      return apiError(
        "version_conflict",
        "A concurrent snapshot took this version — retry.",
        409,
      )
    }
    return apiError("internal_error", insertErr?.message ?? "insert failed", 500)
  }
  const inserted = insertedRaw as unknown as ReportSnapshot

  // Synchronous PDF render (best-effort). On failure: snapshot row
  // stays with pdf_status='pending' which the trigger leaves us as
  // default; we flip it to 'failed' so the UI shows the retry button.
  const origin = new URL(request.url).origin
  const cookieHeader = request.headers.get("cookie")
  try {
    const result = await renderSnapshotPdf({
      origin,
      snapshotId: inserted.id,
      tenantId: aggregate.tenantId,
      projectId,
      cookieHeader,
    })
    await supabase
      .from("report_snapshots")
      .update({ pdf_storage_key: result.storageKey, pdf_status: "available" })
      .eq("id", inserted.id)
    if (result.byteSize > 5 * 1024 * 1024) {
      console.warn(
        "[PROJ-21] PDF >5MB",
        JSON.stringify({
          snapshotId: inserted.id,
          byteSize: result.byteSize,
          durationMs: result.durationMs,
        }),
      )
    }
    if (result.durationMs > 10_000) {
      console.warn(
        "[PROJ-21] PDF render >10s",
        JSON.stringify({
          snapshotId: inserted.id,
          durationMs: result.durationMs,
        }),
      )
    }
    inserted.pdf_storage_key = result.storageKey
    inserted.pdf_status = "available"
  } catch (renderErr) {
    console.error(
      "[PROJ-21] PDF render failed",
      JSON.stringify({
        snapshotId: inserted.id,
        error:
          renderErr instanceof Error ? renderErr.message : String(renderErr),
      }),
    )
    await supabase
      .from("report_snapshots")
      .update({ pdf_status: "failed" })
      .eq("id", inserted.id)
    inserted.pdf_status = "failed"
  }

  return NextResponse.json({
    snapshot: inserted,
    snapshotUrl: `${origin}/reports/snapshots/${inserted.id}`,
  })
}
