/**
 * PROJ-132 + PROJ-141-γ4/γ5 — client wrappers for the operative reporting VIEW.
 *
 * fetchOperativeReport(projectId, filters?) calls the read-only data route
 * (which delegates to the SECURITY-INVOKER RPC operative_report with the
 * filter args threaded in-DB). Need-to-know is enforced server-side.
 * operativeReportExportUrl(projectId, section, filters?) builds the RLS-scoped
 * CSV export URL per section, with the same filter query params applied.
 * operativeReportPrintUrl(projectId, filters?) builds the print-to-PDF URL.
 */

import {
  EMPTY_OPERATIVE_REPORT,
  type OperativeExportSection,
  type OperativeReport,
  type OperativeReportFilters,
} from "@/types/operative-report"

async function safeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    return body.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

/** Build the URLSearchParams for the four filter axes (skips null/undefined). */
export function buildOperativeFilterQuery(
  filters?: OperativeReportFilters
): string {
  if (!filters) return ""
  const params = new URLSearchParams()
  if (filters.workstream_id) params.set("workstream_id", filters.workstream_id)
  if (filters.owner_id) params.set("owner_id", filters.owner_id)
  if (filters.phase_id) params.set("phase_id", filters.phase_id)
  if (filters.classification)
    params.set("classification", filters.classification)
  const s = params.toString()
  return s ? `&${s}` : ""
}

/** Live operative report for a project (need-to-know-scoped server-side). */
export async function fetchOperativeReport(
  projectId: string,
  filters?: OperativeReportFilters
): Promise<OperativeReport> {
  const qs = buildOperativeFilterQuery(filters).replace(/^&/, "?")
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/operative-report${qs}`,
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
  }
}

/** CSV export URL for a section (RLS-scoped, formula-safe, filter-aware). */
export function operativeReportExportUrl(
  projectId: string,
  section: OperativeExportSection,
  filters?: OperativeReportFilters
): string {
  const base = `/api/projects/${encodeURIComponent(projectId)}/operative-report/export?section=${section}`
  return `${base}${buildOperativeFilterQuery(filters)}`
}

/** Print-to-PDF page URL for the report (filters propagated). */
export function operativeReportPrintUrl(
  projectId: string,
  filters?: OperativeReportFilters
): string {
  const qs = buildOperativeFilterQuery(filters).replace(/^&/, "?")
  return `/projects/${encodeURIComponent(projectId)}/operative-report/print${qs}`
}
