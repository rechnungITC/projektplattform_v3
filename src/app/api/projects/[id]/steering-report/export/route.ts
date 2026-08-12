import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import {
  logConfidentialReportRead,
  mustBlockOnLogFailure,
} from "@/lib/audit/confidential-read"
import type { ReportConfidentiality } from "@/lib/audit/confidential-read"

// PROJ-131 — CSV export of the steering report sections (AC-131-4).
//
// GET /api/projects/[id]/steering-report/export?section=findings|risks|tasks
//
// Single source of truth: calls the SAME SECURITY INVOKER RPC as the page
// (steering_report), so every export is RLS-scoped to the caller — a row the
// caller may not see (need-to-know / advisor stream) is never exported. Opens
// in Excel; true .xlsx + Word are out of scope (PROJ-Y-131b, no new dep).
// Task responsible-user ids are resolved to names via profiles (readable under
// the caller RLS).

const SECTIONS = ["findings", "risks", "tasks"] as const
type Section = (typeof SECTIONS)[number]

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  const s = String(value)
  // Escape for CSV + neutralise spreadsheet formula-injection (=,+,-,@).
  const needsQuote = /[",\n\r]/.test(s) || /^[=+\-@]/.test(s)
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return needsQuote ? `"${safe.replace(/"/g, '""')}"` : safe
}

interface FindingRow {
  title: string
  stream_label: string | null
  severity: string
  economic_impact_eur: number | null
  recommended_treatment: string | null
  status: string
}
interface RiskRow {
  title: string
  workstream_label: string | null
  probability: number
  impact: number
  score: number
  severity_bucket: string
  status: string
}
interface TaskRow {
  title: string
  status: string
  due_date: string | null
  days_overdue: number
  responsible_user_id: string | null
  phase_name: string | null
  workstream_label: string | null
  is_blocked: boolean
}
interface SteeringReport {
  red_flags?: { findings?: FindingRow[]; risks?: RiskRow[] }
  critical_tasks?: { tasks?: TaskRow[] }
  /** PROJ-130-δ2 — Stufen-Zusammenfassung der Auswertung (Grundlage des Zugriffsprotokolls). */
  confidentiality?: ReportConfidentiality
}

const COLUMNS: Record<Section, readonly string[]> = {
  findings: [
    "titel",
    "stream",
    "schwere",
    "wirtschaftlicher_impact_eur",
    "empfohlene_behandlung",
    "status",
  ],
  risks: [
    "titel",
    "workstream",
    "wahrscheinlichkeit",
    "auswirkung",
    "score",
    "schwere",
    "status",
  ],
  tasks: [
    "titel",
    "workstream",
    "phase",
    "verantwortlich",
    "frist",
    "status",
    "tage_ueber_frist",
    "blockiert",
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

  const sectionParam =
    new URL(request.url).searchParams.get("section") ?? "findings"
  const parsedSection = z.enum(SECTIONS).safeParse(sectionParam)
  if (!parsedSection.success) {
    return apiError("validation_error", "Invalid section.", 400, "section")
  }
  const section = parsedSection.data

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase.rpc("steering_report", {
    p_project_id: projectId,
  })
  if (error) return apiError("export_failed", error.message, 500)

  const report = (data as SteeringReport | null) ?? {}

  // PROJ-130-δ2: hier verlässt die Auswertung das System als Datei — Austritt,
  // also ab `confidential` protokolliert (nicht erst bei `strict` wie die
  // In-App-Ansicht). Ein Ereignis pro Export.
  const readLog = await logConfidentialReportRead(
    async (fn, args) => await supabase.rpc(fn, args),
    {
      projectId,
      report: "steering_report",
      surface: "export",
      payload: report,
      detail: { format: "csv", section },
    }
  )
  if (mustBlockOnLogFailure(readLog)) {
    return apiError(
      "audit_log_failed",
      "Der Export enthält streng vertrauliche Inhalte und konnte nicht protokolliert werden — er wurde deshalb nicht ausgeliefert.",
      500
    )
  }

  // Resolve responsible-user display names for the tasks section only.
  const ownerIds = new Set<string>()
  if (section === "tasks") {
    for (const t of report.critical_tasks?.tasks ?? [])
      if (t.responsible_user_id) ownerIds.add(t.responsible_user_id)
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

  if (section === "findings") {
    rows = (report.red_flags?.findings ?? []).map((f) =>
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
  } else if (section === "risks") {
    rows = (report.red_flags?.risks ?? []).map((r) =>
      [
        r.title,
        r.workstream_label,
        r.probability,
        r.impact,
        r.score,
        r.severity_bucket,
        r.status,
      ]
        .map(csvCell)
        .join(",")
    )
  } else {
    rows = (report.critical_tasks?.tasks ?? []).map((t) =>
      [
        t.title,
        t.workstream_label,
        t.phase_name,
        ownerName(t.responsible_user_id),
        t.due_date,
        t.status,
        t.days_overdue,
        t.is_blocked ? "ja" : "nein",
      ]
        .map(csvCell)
        .join(",")
    )
  }

  const csv = `${columns.join(",")}\n${rows.join("\n")}`
  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `steering-report-${section}-${projectId.slice(0, 8)}-${stamp}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // RLS-limited scope is explicit so an incomplete export is not mistaken
      // for the full data set.
      "X-Export-Scope": "steering-report-visible-to-caller",
    },
  })
}
