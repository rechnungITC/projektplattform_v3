import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-132 — CSV export of the operative reporting sections (AC: PDF/Excel export).
//
// GET /api/projects/[id]/operative-report/export?section=tasks|findings|qa|deliverables
//
// Single source of truth: calls the SAME SECURITY INVOKER RPC as the page
// (operative_report), so every export is RLS-scoped to the caller — a row the
// caller may not see (need-to-know / advisor stream) is never exported. Opens in
// Excel; true .xlsx is out of scope (no new dep, repo convention). Responsible-
// user ids are resolved to names via profiles (readable under the caller RLS).

const SECTIONS = ["tasks", "findings", "qa", "deliverables"] as const
type Section = (typeof SECTIONS)[number]

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  const s = String(value)
  // Escape for CSV + neutralise spreadsheet formula-injection (=,+,-,@).
  const needsQuote = /[",\n\r]/.test(s) || /^[=+\-@]/.test(s)
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return needsQuote ? `"${safe.replace(/"/g, '""')}"` : safe
}

interface TaskRow {
  title: string
  status: string
  due_date: string | null
  days_overdue: number
  responsible_user_id: string | null
  phase_name: string | null
  workstream_label: string | null
}
interface FindingRow {
  title: string
  stream_label: string | null
  severity: string
  economic_impact_eur: number | null
  recommended_treatment: string | null
  status: string
}
interface QaRow {
  stream_label: string | null
  qa_open: number
  qa_answered: number
}
interface DeliverableRow {
  name: string
  status: string
  due_date: string | null
  responsible_user_id: string | null
  phase_name: string | null
  workstream_label: string | null
  is_overdue: boolean
}
interface OperativeReport {
  tasks_overdue?: { tasks?: TaskRow[] }
  findings_by_severity?: { findings?: FindingRow[] }
  qa_by_stream?: QaRow[]
  deliverables_status?: { deliverables?: DeliverableRow[] }
}

const COLUMNS: Record<Section, readonly string[]> = {
  tasks: [
    "titel",
    "workstream",
    "phase",
    "verantwortlich",
    "frist",
    "status",
    "tage_ueber_frist",
  ],
  findings: [
    "titel",
    "stream",
    "schwere",
    "wirtschaftlicher_impact_eur",
    "empfohlene_behandlung",
    "status",
  ],
  qa: ["stream", "offen", "beantwortet"],
  deliverables: [
    "name",
    "workstream",
    "phase",
    "verantwortlich",
    "frist",
    "status",
    "ueberfaellig",
  ],
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const sectionParam = new URL(request.url).searchParams.get("section") ?? "tasks"
  const parsedSection = z.enum(SECTIONS).safeParse(sectionParam)
  if (!parsedSection.success) {
    return apiError("validation_error", "Invalid section.", 400, "section")
  }
  const section = parsedSection.data

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase.rpc("operative_report", {
    p_project_id: projectId,
  })
  if (error) return apiError("export_failed", error.message, 500)

  const report = (data as OperativeReport | null) ?? {}

  // Resolve responsible-user display names for the row-carrying sections.
  const ownerIds = new Set<string>()
  if (section === "tasks") {
    for (const t of report.tasks_overdue?.tasks ?? [])
      if (t.responsible_user_id) ownerIds.add(t.responsible_user_id)
  } else if (section === "deliverables") {
    for (const d of report.deliverables_status?.deliverables ?? [])
      if (d.responsible_user_id) ownerIds.add(d.responsible_user_id)
  }
  const nameById = new Map<string, string>()
  if (ownerIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", Array.from(ownerIds))
    for (const p of (profiles ?? []) as {
      id: string
      display_name: string | null
      email: string | null
    }[]) {
      nameById.set(p.id, p.display_name ?? p.email ?? p.id)
    }
  }
  const ownerName = (uid: string | null) =>
    uid ? (nameById.get(uid) ?? uid) : ""

  const columns = COLUMNS[section]
  let rows: string[] = []

  if (section === "tasks") {
    rows = (report.tasks_overdue?.tasks ?? []).map((t) =>
      [
        t.title,
        t.workstream_label,
        t.phase_name,
        ownerName(t.responsible_user_id),
        t.due_date,
        t.status,
        t.days_overdue,
      ]
        .map(csvCell)
        .join(",")
    )
  } else if (section === "findings") {
    rows = (report.findings_by_severity?.findings ?? []).map((f) =>
      [
        f.title,
        f.stream_label,
        f.severity,
        f.economic_impact_eur,
        f.recommended_treatment,
        f.status,
      ]
        .map(csvCell)
        .join(",")
    )
  } else if (section === "qa") {
    rows = (report.qa_by_stream ?? []).map((q) =>
      [q.stream_label, q.qa_open, q.qa_answered].map(csvCell).join(",")
    )
  } else {
    rows = (report.deliverables_status?.deliverables ?? []).map((d) =>
      [
        d.name,
        d.workstream_label,
        d.phase_name,
        ownerName(d.responsible_user_id),
        d.due_date,
        d.status,
        d.is_overdue ? "ja" : "nein",
      ]
        .map(csvCell)
        .join(",")
    )
  }

  const csv = `${columns.join(",")}\n${rows.join("\n")}`
  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `operatives-reporting-${section}-${projectId.slice(0, 8)}-${stamp}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // RLS-limited scope is explicit so an incomplete export is not mistaken
      // for the full data set.
      "X-Export-Scope": "operative-report-visible-to-caller",
    },
  })
}
