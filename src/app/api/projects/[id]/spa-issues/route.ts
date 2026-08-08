import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import {
  createSpaIssueSchema,
  SPA_ISSUE_CATEGORIES,
  SPA_ISSUE_IMPORTANCES,
  SPA_ISSUE_SELECT,
  SPA_ISSUE_STATUSES,
} from "./_schema"

// PROJ-122 — SPA issues (contract negotiation points) per project.
//
// GET  /api/projects/[id]/spa-issues[?status=&category=&importance=&responsibleId=]
//      list; RLS + the RESTRICTIVE need-to-know gate scope the rows, so a
//      caller without clearance simply sees fewer issues.
// POST /api/projects/[id]/spa-issues
//      create via create_spa_issue RPC (role + clearance enforced server-side;
//      the RPC also assigns the per-project issue number).
//
// Both use requireProjectAccess(..., "view"): the real authorization lives in
// the SECURITY DEFINER RPC, mirroring dd_findings.

export async function GET(
  request: Request,
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

  const params = new URL(request.url).searchParams
  const status = params.get("status")
  const category = params.get("category")
  const importance = params.get("importance")
  const responsibleId = params.get("responsibleId")

  let query = supabase
    .from("spa_issues")
    .select(SPA_ISSUE_SELECT)
    .eq("project_id", projectId)

  if (status && (SPA_ISSUE_STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status)
  }
  if (category && (SPA_ISSUE_CATEGORIES as readonly string[]).includes(category)) {
    query = query.eq("category", category)
  }
  if (
    importance &&
    (SPA_ISSUE_IMPORTANCES as readonly string[]).includes(importance)
  ) {
    query = query.eq("importance", importance)
  }
  if (responsibleId && z.string().uuid().safeParse(responsibleId).success) {
    query = query.eq("responsible_user_id", responsibleId)
  }

  const { data, error } = await query
    .order("issue_number", { ascending: true })
    .limit(1000)
  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ issues: data ?? [] })
}

export async function POST(
  request: Request,
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = createSpaIssueSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }
  const d = parsed.data

  const { data, error } = await supabase.rpc("create_spa_issue", {
    p_project_id: projectId,
    p_title: d.title,
    p_clause_reference: d.clause_reference ?? null,
    p_category: d.category ?? "other",
    p_own_position: d.own_position ?? null,
    p_counterparty_position: d.counterparty_position ?? null,
    p_recommended_solution: d.recommended_solution ?? null,
    p_risk_if_no_agreement: d.risk_if_no_agreement ?? null,
    p_importance: d.importance ?? "mittel",
    p_responsible_user_id: d.responsible_user_id ?? null,
    p_due_date: d.due_date ?? null,
    p_linked_finding_id: d.linked_finding_id ?? null,
    p_linked_risk_id: d.linked_risk_id ?? null,
    // Default preselect is 'confidential' (AC-122-H5); an explicit null falls
    // through to the RPC's own default rather than the table default.
    p_confidentiality_level: d.confidentiality_level ?? "confidential",
  })

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Not authorized to create this SPA issue at this confidentiality level.",
        403
      )
    }
    if (error.code === "P0002") {
      return apiError("not_found", "Project not found.", 404)
    }
    if (error.code?.startsWith("23") || error.code === "22023") {
      return apiError("validation_error", error.message, 400)
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ issue: data }, { status: 201 })
}
