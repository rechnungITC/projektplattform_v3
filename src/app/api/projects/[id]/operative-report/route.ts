import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-132 + PROJ-141-γ4/γ5 — Operatives Reporting (read-only) with in-DB filters.
//
// GET /api/projects/[id]/operative-report
//   ?workstream_id=<uuid>&owner_id=<uuid>&phase_id=<uuid>&classification=<enum>
//
// Delegates to the SECURITY INVOKER RPC operative_report(uuid, uuid, uuid, uuid, text),
// which runs as the CALLER — so the RESTRICTIVE need-to-know policies on
// work_items / dd_findings / dd_questions / deliverables / dd_streams filter
// rows before the filter args are applied (aggregate-leak safe). All four
// filter args are optional — omitting them yields byte-identical output to the
// pre-γ4 1-arg call.
// MUST use the session-bound user client, NEVER service-role.

const CLASSIFICATION_VALUES = ["standard", "confidential", "strict"] as const

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

const OptionalUuid = z.string().uuid().optional().nullable()
const OptionalClassification = z
  .enum(CLASSIFICATION_VALUES)
  .optional()
  .nullable()

export function parseOperativeReportFilters(searchParams: URLSearchParams) {
  const raw = {
    workstream_id: searchParams.get("workstream_id") || undefined,
    owner_id: searchParams.get("owner_id") || undefined,
    phase_id: searchParams.get("phase_id") || undefined,
    classification: searchParams.get("classification") || undefined,
  }
  const ws = OptionalUuid.safeParse(raw.workstream_id)
  const ow = OptionalUuid.safeParse(raw.owner_id)
  const ph = OptionalUuid.safeParse(raw.phase_id)
  const cl = OptionalClassification.safeParse(raw.classification)
  if (!ws.success)
    return { error: "workstream_id" as const, field: "workstream_id" as const }
  if (!ow.success)
    return { error: "owner_id" as const, field: "owner_id" as const }
  if (!ph.success)
    return { error: "phase_id" as const, field: "phase_id" as const }
  if (!cl.success)
    return {
      error: "classification" as const,
      field: "classification" as const,
    }
  return {
    ok: true as const,
    filters: {
      p_workstream_id: ws.data ?? null,
      p_owner_id: ow.data ?? null,
      p_phase_id: ph.data ?? null,
      p_classification: cl.data ?? null,
    },
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const url = new URL(request.url)
  const parsed = parseOperativeReportFilters(url.searchParams)
  if ("error" in parsed) {
    return apiError(
      "validation_error",
      `Invalid ${parsed.field}.`,
      400,
      parsed.field
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase.rpc("operative_report", {
    p_project_id: projectId,
    ...parsed.filters,
  })
  if (error) return apiError("overview_failed", error.message, 500)

  return NextResponse.json(data ?? EMPTY_REPORT)
}
