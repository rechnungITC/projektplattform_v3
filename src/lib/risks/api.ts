/**
 * PROJ-20 — fetch wrappers around the /api/projects/[id]/risks surface.
 */

import type { Risk, RiskStatus } from "@/types/risk"

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
  `/api/projects/${encodeURIComponent(projectId)}/risks`

export async function listRisks(
  projectId: string,
  options: { status?: RiskStatus } = {}
): Promise<Risk[]> {
  const url = options.status
    ? `${base(projectId)}?status=${options.status}`
    : base(projectId)
  const response = await fetch(url, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { risks: Risk[] }
  return body.risks ?? []
}

export interface RiskInput {
  title: string
  description?: string | null
  probability: number
  impact: number
  status?: RiskStatus
  mitigation?: string | null
  responsible_user_id?: string | null
}

export async function createRisk(
  projectId: string,
  input: RiskInput
): Promise<Risk> {
  const response = await fetch(base(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { risk: Risk }
  return body.risk
}

export async function updateRisk(
  projectId: string,
  riskId: string,
  input: Partial<RiskInput>
): Promise<Risk> {
  const response = await fetch(
    `${base(projectId)}/${encodeURIComponent(riskId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { risk: Risk }
  return body.risk
}

export async function deleteRisk(
  projectId: string,
  riskId: string
): Promise<void> {
  const response = await fetch(
    `${base(projectId)}/${encodeURIComponent(riskId)}`,
    { method: "DELETE" }
  )
  if (!response.ok && response.status !== 204) {
    throw new Error(await safeError(response))
  }
}
