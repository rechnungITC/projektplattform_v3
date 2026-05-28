/**
 * PROJ-65 ε.3e (F-62) — fetch wrappers around /api/projects/[id]/risk-links.
 */

export type RiskLinkKind = "phase" | "sprint"

export interface RiskLink {
  id: string
  tenant_id: string
  risk_id: string
  linked_kind: RiskLinkKind
  linked_id: string
  created_by: string | null
  created_at: string
}

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

async function safeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody
    return body.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

const base = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/risk-links`

export async function listRiskLinks(
  projectId: string,
  filter: { riskId?: string; linkedKind?: RiskLinkKind; linkedId?: string } = {},
): Promise<RiskLink[]> {
  const params = new URLSearchParams()
  if (filter.riskId) params.set("risk_id", filter.riskId)
  if (filter.linkedKind) params.set("linked_kind", filter.linkedKind)
  if (filter.linkedId) params.set("linked_id", filter.linkedId)
  const qs = params.toString()
  const url = qs ? `${base(projectId)}?${qs}` : base(projectId)
  const response = await fetch(url, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { risk_links: RiskLink[] }
  return body.risk_links ?? []
}

export async function createRiskLink(
  projectId: string,
  input: { risk_id: string; linked_kind: RiskLinkKind; linked_id: string },
): Promise<RiskLink> {
  const response = await fetch(base(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { risk_link: RiskLink }
  return body.risk_link
}

export async function deleteRiskLink(
  projectId: string,
  linkId: string,
): Promise<void> {
  const response = await fetch(
    `${base(projectId)}/${encodeURIComponent(linkId)}`,
    { method: "DELETE" },
  )
  if (!response.ok) throw new Error(await safeError(response))
}
