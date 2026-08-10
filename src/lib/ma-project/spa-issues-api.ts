// PROJ-122 — client wrappers + types for the SPA issues list (Epic J).

export type SpaIssueStatus =
  | "open"
  | "in_negotiation"
  | "agreed"
  | "escalated"
  | "closed"

export type SpaIssueCategory =
  | "warranty"
  | "indemnity"
  | "purchase_price"
  | "liability"
  | "condition"
  | "other"

export type SpaIssueImportance = "niedrig" | "mittel" | "hoch" | "kritisch"

export type SpaConfidentialityLevel = "standard" | "confidential" | "strict"

export interface SpaIssue {
  id: string
  tenant_id: string
  project_id: string
  issue_number: number
  title: string
  clause_reference: string | null
  category: SpaIssueCategory
  own_position: string | null
  counterparty_position: string | null
  recommended_solution: string | null
  risk_if_no_agreement: string | null
  status: SpaIssueStatus
  importance: SpaIssueImportance
  responsible_user_id: string | null
  due_date: string | null
  linked_finding_id: string | null
  linked_risk_id: string | null
  confidentiality_level: SpaConfidentialityLevel
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface SpaIssueSummaryRow {
  status: SpaIssueStatus
  issue_count: number
}

export interface SpaIssueFilters {
  status?: SpaIssueStatus | null
  category?: SpaIssueCategory | null
  importance?: SpaIssueImportance | null
  responsibleId?: string | null
}

export interface CreateSpaIssuePayload {
  title: string
  clause_reference?: string | null
  category?: SpaIssueCategory
  own_position?: string | null
  counterparty_position?: string | null
  recommended_solution?: string | null
  risk_if_no_agreement?: string | null
  importance?: SpaIssueImportance
  responsible_user_id?: string | null
  due_date?: string | null
  linked_finding_id?: string | null
  linked_risk_id?: string | null
  confidentiality_level?: SpaConfidentialityLevel | null
}

export type UpdateSpaIssuePayload = Partial<{
  title: string
  clause_reference: string | null
  category: SpaIssueCategory
  own_position: string | null
  counterparty_position: string | null
  recommended_solution: string | null
  risk_if_no_agreement: string | null
  importance: SpaIssueImportance
  responsible_user_id: string | null
  due_date: string | null
  linked_finding_id: string | null
  linked_risk_id: string | null
  confidentiality_level: SpaConfidentialityLevel
}>

function base(projectId: string) {
  return `/api/projects/${projectId}/spa-issues`
}

async function safeError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    return body?.error?.message ?? `Request failed (${res.status}).`
  } catch {
    return `Request failed (${res.status}).`
  }
}

function filterQuery(filters?: SpaIssueFilters): string {
  if (!filters) return ""
  const p = new URLSearchParams()
  if (filters.status) p.set("status", filters.status)
  if (filters.category) p.set("category", filters.category)
  if (filters.importance) p.set("importance", filters.importance)
  if (filters.responsibleId) p.set("responsibleId", filters.responsibleId)
  const q = p.toString()
  return q ? `?${q}` : ""
}

export async function listSpaIssues(
  projectId: string,
  filters?: SpaIssueFilters
): Promise<SpaIssue[]> {
  const res = await fetch(`${base(projectId)}${filterQuery(filters)}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { issues: SpaIssue[] }).issues
}

export async function fetchSpaIssuesSummary(
  projectId: string
): Promise<SpaIssueSummaryRow[]> {
  const res = await fetch(`${base(projectId)}/summary`, { cache: "no-store" })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { summary: SpaIssueSummaryRow[] }).summary
}

export async function createSpaIssue(
  projectId: string,
  payload: CreateSpaIssuePayload
): Promise<SpaIssue> {
  const res = await fetch(base(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { issue: SpaIssue }).issue
}

export async function updateSpaIssue(
  projectId: string,
  issueId: string,
  payload: UpdateSpaIssuePayload
): Promise<SpaIssue> {
  const res = await fetch(`${base(projectId)}/${issueId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { issue: SpaIssue }).issue
}

export async function transitionSpaIssueStatus(
  projectId: string,
  issueId: string,
  status: SpaIssueStatus
): Promise<SpaIssue> {
  const res = await fetch(`${base(projectId)}/${issueId}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { issue: SpaIssue }).issue
}

export function spaIssuesExportUrl(
  projectId: string,
  filters?: SpaIssueFilters
): string {
  return `${base(projectId)}/export${filterQuery(filters)}`
}
