import { NextResponse } from "next/server"

import {
  CONSTRUCTION_DEFECT_OVERDUE_STATUSES,
  defectOverdueCutoff,
} from "@/lib/construction/defects"
import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../_lib/route-helpers"

import {
  createDefectSchema,
  DEFECT_SELECT,
  defectRpcErrorStatus,
  defectSeverityFilterSchema,
  defectStatusFilterSchema,
  idSchema,
} from "./_schema"

// PROJ-45-β — construction defects (Mängel) of one project.
//
// GET  — filterable list. Filters are applied server-side so the surface stays
//        usable on a large defect register.
// POST — report a defect via create_construction_defect.

export async function GET(
  request: Request,
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

  // AC-45.24: module off -> the surface answers as if it did not exist.
  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "construction"
  )
  if (moduleDenial) return moduleDenial

  const search = new URL(request.url).searchParams
  const tradeId = search.get("trade_id")
  const sectionId = search.get("section_id")
  const status = search.get("status")
  const severity = search.get("severity")
  const overdue = search.get("overdue")

  let query = supabase
    .from("construction_defects")
    .select(DEFECT_SELECT)
    .eq("project_id", projectId)

  if (tradeId && idSchema.safeParse(tradeId).success) {
    query = query.eq("trade_id", tradeId)
  }
  if (sectionId && idSchema.safeParse(sectionId).success) {
    query = query.eq("section_id", sectionId)
  }
  if (status && defectStatusFilterSchema.safeParse(status).success) {
    query = query.eq("status", status)
  }
  if (severity && defectSeverityFilterSchema.safeParse(severity).success) {
    query = query.eq("severity", severity)
  }

  // Overdue is NOT re-invented here. The authoritative definition is the SQL
  // predicate `_construction_defect_is_overdue(status, due_date)` from migration
  // 20260818104358, which also feeds construction_defect_summary; the shared
  // pure helper in @/lib/construction/defects is its TypeScript twin and derives
  // the per-row flags. Both sides are pinned by tests, so the filtered list can
  // never contradict the counters in its own header.
  if (overdue === "true") {
    query = query
      .lt("due_date", defectOverdueCutoff())
      .in("status", [...CONSTRUCTION_DEFECT_OVERDUE_STATUSES])
  } else if (overdue === "false") {
    // "Not overdue" is the complement, and a null deadline belongs to it — so it
    // cannot be expressed as a single negated comparison.
    query = query.or(
      `due_date.is.null,due_date.gte.${defectOverdueCutoff()},status.in.(erledigt,geprueft,verworfen)`
    )
  }

  const { data, error } = await query
    .order("defect_number", { ascending: true })
    .limit(1000)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ defects: data ?? [] })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  if (!idSchema.safeParse(projectId).success) {
    return apiError("invalid_id", "Malformed project id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // Deliberately "view", NOT "edit": lock L15 lets ANY project member — viewers
  // included — report a defect, because defects arise on the site walk, not at
  // the desk. The role authority is `is_project_member` inside the RPC, which is
  // the one place the deviation is written down; gating "edit" here would lock
  // out exactly the caller the lock intends to admit.
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "construction",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = createDefectSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_failed", parsed.error.issues[0].message, 422)
  }
  const d = parsed.data

  const { data, error } = await supabase.rpc("create_construction_defect", {
    p_project_id: projectId,
    p_title: d.title,
    p_trade_id: d.trade_id,
    p_severity: d.severity ?? "gering",
    p_section_id: d.section_id ?? null,
    p_description: d.description ?? null,
    p_due_date: d.due_date ?? null,
    // Left null on purpose when absent: the RPC then pre-fills the trade's
    // subcontractor, and from that moment the defect carries its own bond.
    p_vendor_id: d.vendor_id ?? null,
  })

  if (error) {
    const mapped = defectRpcErrorStatus(error.code)
    if (mapped) return apiError(mapped.code, error.message, mapped.status)
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ defect: data }, { status: 201 })
}
