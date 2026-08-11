import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import {
  logConfidentialExport,
  mustBlockOnLogFailure,
} from "@/lib/audit/confidential-read"

import {
  SPA_ISSUE_CATEGORIES,
  SPA_ISSUE_IMPORTANCES,
  SPA_ISSUE_STATUSES,
} from "../_schema"

// PROJ-122 — CSV export of the SPA issues list (DoD "exportierbar", AC-122-H9).
//
// GET /api/projects/[id]/spa-issues/export?status=&category=&importance=&responsibleId=
//
// Runs under the caller's own RLS, so the file contains ONLY the issues the
// caller is cleared to see. The limited scope is stamped into the filename and
// an X-Export-Scope header so a partial (low-clearance) export is never
// mistaken for "the complete issues list" - same guard as PROJ-113.

const COLUMNS = [
  "issue_number",
  "title",
  "clause_reference",
  "category",
  "status",
  "importance",
  "own_position",
  "counterparty_position",
  "recommended_solution",
  "risk_if_no_agreement",
  "due_date",
  "confidentiality_level",
  "created_at",
  "updated_at",
] as const

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  const s = String(value)
  // Escape for CSV; also neutralise spreadsheet formula-injection (=,+,-,@).
  const needsQuote = /[",\n\r]/.test(s) || /^[=+\-@]/.test(s)
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return needsQuote ? `"${safe.replace(/"/g, '""')}"` : safe
}

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
    .select(COLUMNS.join(", "))
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
    .limit(5000)
  if (error) return apiError("export_failed", error.message, 500)

  const rows = (data ?? []) as unknown as Record<string, unknown>[]

  // PROJ-130-δ1: siehe dd-questions/export — EIN Ereignis pro Export mit
  // höchster Stufe und Anzahl der vertraulichen Zeilen; nichts bei rein
  // `standard`-Inhalten; fail-closed nur bei `strict`.
  const readLog = await logConfidentialExport(
    async (fn, args) => await supabase.rpc(fn, args),
    {
      projectId,
      entityType: "spa_issues",
      rows: rows as ReadonlyArray<{ confidentiality_level?: string | null }>,
      detail: { format: "csv" },
    }
  )
  if (mustBlockOnLogFailure(readLog)) {
    return apiError(
      "audit_log_failed",
      "Der Export enthält streng vertrauliche Inhalte und konnte nicht protokolliert werden — er wurde deshalb nicht ausgeliefert.",
      500
    )
  }

  const header = COLUMNS.join(",")
  const body = rows
    .map((r) => COLUMNS.map((c) => csvCell(r[c])).join(","))
    .join("\n")
  const csv = `${header}\n${body}`

  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `spa-issues-${projectId.slice(0, 8)}-eigene-sicht-${stamp}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Export-Scope": "spa-issues-visible-to-caller",
    },
  })
}
