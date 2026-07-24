import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-132 — Operatives Reporting für PMO, Deal Lead und Workstreams (read-only).
//
// GET /api/projects/[id]/operative-report
//
// Delegates to the SECURITY INVOKER RPC operative_report, which runs as the
// CALLER — so the RESTRICTIVE need-to-know policies on work_items / dd_findings /
// dd_questions / deliverables / dd_streams filter rows before aggregation
// (B4: an external advisor sees only their cleared stream; no aggregate leak).
// MUST use the session-bound user client, NEVER service-role.

const EMPTY_REPORT = {
  tasks_overdue: {
    tasks: [],
    summary: {
      open_total: 0,
      overdue_total: 0,
      due_today_total: 0,
      due_this_week_total: 0,
      blocked_total: 0,
    },
  },
  findings_by_severity: { streams: [], findings: [] },
  qa_by_stream: [],
  deliverables_status: {
    deliverables: [],
    summary: {
      total: 0,
      planned: 0,
      in_progress: 0,
      in_review: 0,
      approved: 0,
      suspended: 0,
      overdue_total: 0,
      not_approved_total: 0,
    },
  },
  pre_read: {
    overdue_tasks: 0,
    open_deal_breaker_findings: 0,
    open_qa: 0,
    deliverables_not_approved: 0,
  },
}

export async function GET(
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

  const { data, error } = await supabase.rpc("operative_report", {
    p_project_id: projectId,
  })
  if (error) return apiError("overview_failed", error.message, 500)

  return NextResponse.json(data ?? EMPTY_REPORT)
}
