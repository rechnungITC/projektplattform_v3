/**
 * PROJ-8 — fetch wrappers around the /api/projects/[id]/stakeholders surface.
 * Components use these so they don't reach into the API URL shape directly.
 */

import type {
  Stakeholder,
  StakeholderKind,
  StakeholderOrigin,
  StakeholderScore,
  StakeholderSuggestion,
} from "@/types/stakeholder"

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
  `/api/projects/${encodeURIComponent(projectId)}/stakeholders`

export async function listStakeholders(
  projectId: string,
  options: { includeInactive?: boolean } = {}
): Promise<Stakeholder[]> {
  const url = options.includeInactive
    ? `${base(projectId)}?include_inactive=true`
    : base(projectId)
  const response = await fetch(url, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { stakeholders: Stakeholder[] }
  return body.stakeholders ?? []
}

export interface StakeholderInput {
  kind: StakeholderKind
  origin: StakeholderOrigin
  name: string
  role_key?: string | null
  org_unit?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  influence: StakeholderScore
  impact: StakeholderScore
  linked_user_id?: string | null
  notes?: string | null
}

export async function createStakeholder(
  projectId: string,
  input: StakeholderInput
): Promise<Stakeholder> {
  const response = await fetch(base(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { stakeholder: Stakeholder }
  return body.stakeholder
}

export async function updateStakeholder(
  projectId: string,
  sid: string,
  input: Partial<StakeholderInput>
): Promise<Stakeholder> {
  const response = await fetch(`${base(projectId)}/${encodeURIComponent(sid)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { stakeholder: Stakeholder }
  return body.stakeholder
}

export async function deactivateStakeholder(
  projectId: string,
  sid: string
): Promise<void> {
  const response = await fetch(
    `${base(projectId)}/${encodeURIComponent(sid)}/deactivate`,
    { method: "POST" }
  )
  if (!response.ok) throw new Error(await safeError(response))
}

export async function reactivateStakeholder(
  projectId: string,
  sid: string
): Promise<void> {
  const response = await fetch(
    `${base(projectId)}/${encodeURIComponent(sid)}/reactivate`,
    { method: "POST" }
  )
  if (!response.ok) throw new Error(await safeError(response))
}

export async function listStakeholderSuggestions(
  projectId: string
): Promise<StakeholderSuggestion[]> {
  const response = await fetch(`${base(projectId)}/suggestions`, {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as {
    suggestions: StakeholderSuggestion[]
  }
  return body.suggestions ?? []
}

export async function dismissSuggestion(
  projectId: string,
  roleKey: string
): Promise<void> {
  const response = await fetch(`${base(projectId)}/suggestions/dismiss`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role_key: roleKey }),
  })
  if (!response.ok) throw new Error(await safeError(response))
}

export async function clearDismissedSuggestions(
  projectId: string
): Promise<void> {
  const response = await fetch(`${base(projectId)}/suggestions/clear`, {
    method: "POST",
  })
  if (!response.ok) throw new Error(await safeError(response))
}
