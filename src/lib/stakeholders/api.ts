/**
 * PROJ-8 — fetch wrappers around the /api/projects/[id]/stakeholders surface.
 * Components use these so they don't reach into the API URL shape directly.
 */

import type {
  CommunicationNeed,
  DecisionAuthority,
  ManagementLevel,
  PreferredChannel,
  Stakeholder,
  StakeholderAttitude,
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
  // PROJ-33 Phase 33-α — qualitative Bewertungs-Felder. Alle nullable.
  reasoning?: string | null
  stakeholder_type_key?: string | null
  management_level?: ManagementLevel | null
  decision_authority?: DecisionAuthority | null
  attitude?: StakeholderAttitude | null
  conflict_potential?: StakeholderScore | null
  communication_need?: CommunicationNeed | null
  preferred_channel?: PreferredChannel | null
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

export async function copyStakeholder(
  projectId: string,
  sid: string
): Promise<Stakeholder> {
  const response = await fetch(
    `${base(projectId)}/${encodeURIComponent(sid)}/copy`,
    { method: "POST" }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { stakeholder: Stakeholder }
  return body.stakeholder
}

export interface SuggestionsResponse {
  suggestions: StakeholderSuggestion[]
  dismissed_count: number
}

export async function listStakeholderSuggestions(
  projectId: string
): Promise<SuggestionsResponse> {
  const response = await fetch(`${base(projectId)}/suggestions`, {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as SuggestionsResponse
  return {
    suggestions: body.suggestions ?? [],
    dismissed_count: body.dismissed_count ?? 0,
  }
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

// PROJ-33 Phase 33-δ — Self-Assessment Magic-Link API.

export interface SelfAssessmentInviteResponse {
  invite_id: string
  magic_link_url: string
  expires_at: string
}

export async function createSelfAssessmentInvite(
  projectId: string,
  sid: string
): Promise<SelfAssessmentInviteResponse> {
  const response = await fetch(
    `${base(projectId)}/${encodeURIComponent(sid)}/self-assessment-invite`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as SelfAssessmentInviteResponse
}

export async function revokeSelfAssessmentInvite(
  projectId: string,
  sid: string,
  inviteId: string
): Promise<void> {
  const url = new URL(
    `${base(projectId)}/${encodeURIComponent(sid)}/self-assessment-invite`,
    window.location.origin
  )
  url.searchParams.set("invite_id", inviteId)
  const response = await fetch(url.toString(), { method: "DELETE" })
  if (!response.ok) throw new Error(await safeError(response))
}
