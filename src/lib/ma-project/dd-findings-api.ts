/**
 * PROJ-114 — fetch wrappers for DD-Findings: the per-stream findings register
 * (severity / EUR quantification / recommended treatment), the deal-breaker
 * escalation list (Deal Lead + Sponsor), and the per-stream/severity summary.
 * Consumed by the /frontend slice (DD-Findings tab in the project room).
 */

import type { MaConfidentialityLevel } from "@/types/confidentiality"

export type FindingSeverity = "niedrig" | "mittel" | "hoch" | "deal_breaker"
export type FindingTreatment =
  | "kaufpreisanpassung"
  | "garantie"
  | "freistellung"
  | "integrationsthema"
  | "akzeptiert"
export type FindingStatus = "open" | "in_review" | "resolved" | "dismissed"

export interface DdFinding {
  id: string
  tenant_id: string
  project_id: string
  dd_stream_id: string
  title: string
  description: string | null
  severity: FindingSeverity
  economic_impact_eur: number | null
  probability: number | null
  recommended_treatment: FindingTreatment | null
  status: FindingStatus
  linked_risk_id: string | null
  responsible_user_id: string | null
  confidentiality_level: MaConfidentialityLevel
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface DdFindingEscalation {
  id: string
  tenant_id: string
  project_id: string
  finding_id: string
  escalated_to_user_id: string
  role: "deal_lead" | "sponsor"
  confidentiality_level: MaConfidentialityLevel
  escalated_at: string
  acknowledged_at: string | null
}

export interface DdFindingsSummaryRow {
  dd_stream_id: string
  severity: FindingSeverity
  finding_count: number
  eur_sum: number
  null_eur_count: number
}

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}
async function safeError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorBody
    return body.error?.message ?? `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}
const p = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}`

export interface CreateFindingPayload {
  dd_stream_id: string
  title: string
  description?: string | null
  severity?: FindingSeverity
  economic_impact_eur?: number | null
  probability?: number | null
  recommended_treatment?: FindingTreatment | null
  linked_risk_id?: string | null
  confidentiality_level?: MaConfidentialityLevel | null
}

export type UpdateFindingPayload = Partial<{
  title: string
  description: string | null
  severity: FindingSeverity
  economic_impact_eur: number | null
  clear_eur: boolean
  probability: number | null
  recommended_treatment: FindingTreatment | null
  status: FindingStatus
  linked_risk_id: string | null
  responsible_user_id: string | null
}>

export async function listFindings(
  projectId: string,
  streamId?: string
): Promise<DdFinding[]> {
  const qs = streamId ? `?streamId=${encodeURIComponent(streamId)}` : ""
  const res = await fetch(`${p(projectId)}/dd-findings${qs}`, { cache: "no-store" })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { findings: DdFinding[] }).findings
}

export async function createFinding(
  projectId: string,
  payload: CreateFindingPayload
): Promise<DdFinding> {
  const res = await fetch(`${p(projectId)}/dd-findings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { finding: DdFinding }).finding
}

export async function updateFinding(
  projectId: string,
  findingId: string,
  payload: UpdateFindingPayload
): Promise<DdFinding> {
  const res = await fetch(
    `${p(projectId)}/dd-findings/${encodeURIComponent(findingId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { finding: DdFinding }).finding
}

export async function fetchFindingsSummary(
  projectId: string
): Promise<DdFindingsSummaryRow[]> {
  const res = await fetch(`${p(projectId)}/dd-findings/summary`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { summary: DdFindingsSummaryRow[] }).summary
}

export async function listFindingEscalations(
  projectId: string,
  onlyOpen = false
): Promise<DdFindingEscalation[]> {
  const qs = onlyOpen ? "?open=1" : ""
  const res = await fetch(`${p(projectId)}/dd-finding-escalations${qs}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { escalations: DdFindingEscalation[] }).escalations
}

export async function acknowledgeFindingEscalation(
  projectId: string,
  escId: string
): Promise<DdFindingEscalation> {
  const res = await fetch(
    `${p(projectId)}/dd-finding-escalations/${encodeURIComponent(escId)}/acknowledge`,
    { method: "POST" }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { escalation: DdFindingEscalation }).escalation
}

// --- PROJ-116: consolidated DD report -------------------------------------

export interface DdReportStreamRow {
  dd_stream_id: string
  label: string
  status: string
  findings_total: number
  sev_niedrig: number
  sev_mittel: number
  sev_hoch: number
  sev_deal_breaker: number
  eur_sum: number
  null_eur_count: number
  qa_open: number
  qa_answered: number
}

export interface DdReportRedFlag {
  id: string
  dd_stream_id: string
  title: string
  severity: FindingSeverity
  economic_impact_eur: number | null
  status: FindingStatus
}

export interface DdReport {
  streams: DdReportStreamRow[]
  red_flags: DdReportRedFlag[]
}

/** Consolidated, live DD report (need-to-know-scoped server-side via INVOKER RPC). */
export async function fetchDdReport(projectId: string): Promise<DdReport> {
  const res = await fetch(`${p(projectId)}/dd-report`, { cache: "no-store" })
  if (!res.ok) throw new Error(await safeError(res))
  const json = (await res.json()) as Partial<DdReport>
  return { streams: json.streams ?? [], red_flags: json.red_flags ?? [] }
}
