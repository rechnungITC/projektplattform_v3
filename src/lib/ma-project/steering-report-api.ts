/**
 * PROJ-131 — client wrappers for the steering reporting VIEW layer.
 *
 * fetchSteeringReport() calls the read-only data route (which delegates to the
 * SECURITY-INVOKER RPC steering_report); need-to-know is enforced server-side.
 * steeringReportExportUrl() builds the RLS-scoped CSV export URL per section.
 */

import {
  EMPTY_STEERING_REPORT,
  type SteeringExportSection,
  type SteeringReport,
} from "@/types/steering-report"

async function safeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    return body.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

/** Live steering report for a project (need-to-know-scoped server-side). */
export async function fetchSteeringReport(
  projectId: string
): Promise<SteeringReport> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/steering-report`,
    { cache: "no-store" }
  )
  if (!res.ok) throw new Error(await safeError(res))
  const json = (await res.json()) as Partial<SteeringReport>
  return {
    deal_status: json.deal_status ?? EMPTY_STEERING_REPORT.deal_status,
    next_stage_gate: json.next_stage_gate ?? null,
    stage_gate_summary:
      json.stage_gate_summary ?? EMPTY_STEERING_REPORT.stage_gate_summary,
    // PROJ-120 — null, wenn keine Bewertung existiert ODER der Aufrufer nicht
    // freigegeben ist (die RPC filtert im Aufrufer-Kontext, kein Client-Gate).
    valuation: json.valuation ?? null,
    red_flags: {
      findings: json.red_flags?.findings ?? [],
      risks: json.red_flags?.risks ?? [],
      summary: json.red_flags?.summary ?? EMPTY_STEERING_REPORT.red_flags.summary,
    },
    critical_tasks: {
      tasks: json.critical_tasks?.tasks ?? [],
      summary:
        json.critical_tasks?.summary ??
        EMPTY_STEERING_REPORT.critical_tasks.summary,
    },
    pre_read: json.pre_read ?? EMPTY_STEERING_REPORT.pre_read,
    // PROJ-130-δ2: Stufen-Zusammenfassung der Auswertung; fehlt sie, gilt
    // `standard` — der Server hat dann schon entschieden, nicht zu protokollieren.
    confidentiality: json.confidentiality ?? EMPTY_STEERING_REPORT.confidentiality,
  }
}

/** CSV export URL for a section (RLS-scoped to the caller, formula-safe). */
export function steeringReportExportUrl(
  projectId: string,
  section: SteeringExportSection
): string {
  return `/api/projects/${encodeURIComponent(projectId)}/steering-report/export?section=${section}`
}
