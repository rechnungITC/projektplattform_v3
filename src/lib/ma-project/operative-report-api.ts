/**
 * PROJ-132 — client wrappers for the operative reporting VIEW layer.
 *
 * fetchOperativeReport() calls the read-only data route (which delegates to the
 * SECURITY-INVOKER RPC operative_report); need-to-know is enforced server-side.
 * operativeReportExportUrl() builds the RLS-scoped CSV export URL per section.
 */

import {
  EMPTY_OPERATIVE_REPORT,
  type OperativeExportSection,
  type OperativeReport,
} from "@/types/operative-report"

async function safeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    return body.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

/** Live operative report for a project (need-to-know-scoped server-side). */
export async function fetchOperativeReport(
  projectId: string
): Promise<OperativeReport> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/operative-report`,
    { cache: "no-store" }
  )
  if (!res.ok) throw new Error(await safeError(res))
  const json = (await res.json()) as Partial<OperativeReport>
  return {
    tasks_overdue: {
      tasks: json.tasks_overdue?.tasks ?? [],
      summary:
        json.tasks_overdue?.summary ??
        EMPTY_OPERATIVE_REPORT.tasks_overdue.summary,
    },
    findings_by_severity: {
      streams: json.findings_by_severity?.streams ?? [],
      findings: json.findings_by_severity?.findings ?? [],
    },
    qa_by_stream: json.qa_by_stream ?? [],
    deliverables_status: {
      deliverables: json.deliverables_status?.deliverables ?? [],
      summary:
        json.deliverables_status?.summary ??
        EMPTY_OPERATIVE_REPORT.deliverables_status.summary,
    },
    pre_read: json.pre_read ?? EMPTY_OPERATIVE_REPORT.pre_read,
    // PROJ-130-δ2: Stufen-Zusammenfassung der Auswertung; fehlt sie, gilt
    // `standard` — der Server hat dann schon entschieden, nicht zu protokollieren.
    confidentiality: json.confidentiality ?? EMPTY_OPERATIVE_REPORT.confidentiality,
  }
}

/** CSV export URL for a section (RLS-scoped to the caller, formula-safe). */
export function operativeReportExportUrl(
  projectId: string,
  section: OperativeExportSection
): string {
  return `/api/projects/${encodeURIComponent(projectId)}/operative-report/export?section=${section}`
}
