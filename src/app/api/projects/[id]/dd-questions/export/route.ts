import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { DD_QUESTION_STATUSES } from "../_schema"

// PROJ-113 — CSV export of the DD Q&A list for the seller side.
//
// GET /api/projects/[id]/dd-questions/export?streamId=&status=&ownerId=
//
// Runs under the caller's RLS, so the export contains ONLY questions the caller
// is cleared to see (need-to-know preserved). The view scope is marked in the
// filename + an X-Export-Scope header so an incomplete (low-clearance) export
// is never mistaken for "the full list" (CIA Fork 5).

const COLUMNS = [
  "title",
  "detail",
  "addressee",
  "priority",
  "status",
  "due_date",
  "answer_text",
  "answer_link",
  "answer_round",
  "confidentiality_level",
  "created_at",
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

  const url = new URL(request.url)
  const streamId = url.searchParams.get("streamId")
  const status = url.searchParams.get("status")
  const ownerId = url.searchParams.get("ownerId")

  if (streamId && !z.string().uuid().safeParse(streamId).success) {
    return apiError("validation_error", "Invalid streamId.", 400, "streamId")
  }

  let query = supabase
    .from("dd_questions")
    .select(COLUMNS.join(", "))
    .eq("project_id", projectId)
  if (streamId) query = query.eq("dd_stream_id", streamId)
  if (status && DD_QUESTION_STATUSES.includes(status as (typeof DD_QUESTION_STATUSES)[number])) {
    query = query.eq("status", status)
  }
  if (ownerId && z.string().uuid().safeParse(ownerId).success) {
    query = query.eq("responsible_user_id", ownerId)
  }

  const { data, error } = await query
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(5000)
  if (error) return apiError("export_failed", error.message, 500)

  const rows = (data ?? []) as unknown as Record<string, unknown>[]
  const header = COLUMNS.join(",")
  const body = rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(",")).join("\n")
  const csv = `${header}\n${body}`

  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `dd-questions-${projectId.slice(0, 8)}-eigene-sicht-${stamp}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Make the (RLS-limited) scope explicit so an incomplete export is not
      // mistaken for the complete question list.
      "X-Export-Scope": "questions-visible-to-caller",
    },
  })
}