/**
 * PROJ-98 — fetch wrappers for committees & steering bodies: per-project
 * governance bodies (SteerCo / Core Team / IMO …) with stakeholder-centric
 * membership. Consumed by the /frontend slice (Gremien section in the project
 * room). Writes go through SECURITY DEFINER RPCs behind these routes; the
 * need-to-know gate is enforced server-side.
 */

import type { MaConfidentialityLevel } from "@/types/confidentiality"

export type CommitteeMemberRole = "chair" | "member" | "observer"

export interface CommitteeMember {
  id: string
  stakeholder_id: string
  role_in_committee: CommitteeMemberRole
  is_voting: boolean
  stakeholder: { id: string; name: string } | null
}

export interface Committee {
  id: string
  name: string
  purpose: string | null
  cadence: string | null
  decision_scope: string | null
  value_threshold_eur: number | null
  value_threshold_currency: string | null
  escalation_scope: string | null
  confidentiality_level: MaConfidentialityLevel
  sort_order: number
  created_at: string
  updated_at: string
  members: CommitteeMember[]
}

export interface CommitteePayload {
  name: string
  purpose?: string | null
  cadence?: string | null
  decision_scope?: string | null
  value_threshold_eur?: number | null
  value_threshold_currency?: string | null
  escalation_scope?: string | null
  confidentiality_level?: MaConfidentialityLevel
}

interface ApiErrorBody {
  error?: { message?: string }
}

async function safeError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorBody
    return body.error?.message ?? `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

const base = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/committees`

export async function listCommittees(projectId: string): Promise<Committee[]> {
  const res = await fetch(base(projectId), { cache: "no-store" })
  if (!res.ok) throw new Error(await safeError(res))
  const json = (await res.json()) as { committees?: Committee[] }
  return json.committees ?? []
}

export async function createCommittee(
  projectId: string,
  payload: CommitteePayload
): Promise<Committee> {
  const res = await fetch(base(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { committee: Committee }).committee
}

export async function updateCommittee(
  projectId: string,
  committeeId: string,
  payload: CommitteePayload
): Promise<Committee> {
  const res = await fetch(`${base(projectId)}/${committeeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { committee: Committee }).committee
}

export async function deleteCommittee(
  projectId: string,
  committeeId: string
): Promise<void> {
  const res = await fetch(`${base(projectId)}/${committeeId}`, { method: "DELETE" })
  if (!res.ok) throw new Error(await safeError(res))
}

export async function addCommitteeMember(
  projectId: string,
  committeeId: string,
  payload: { stakeholder_id: string; role_in_committee?: CommitteeMemberRole; is_voting?: boolean }
): Promise<CommitteeMember> {
  const res = await fetch(`${base(projectId)}/${committeeId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { member: CommitteeMember }).member
}

export async function updateCommitteeMember(
  projectId: string,
  committeeId: string,
  memberId: string,
  payload: { role_in_committee?: CommitteeMemberRole; is_voting?: boolean }
): Promise<CommitteeMember> {
  const res = await fetch(`${base(projectId)}/${committeeId}/members/${memberId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { member: CommitteeMember }).member
}

export async function removeCommitteeMember(
  projectId: string,
  committeeId: string,
  memberId: string
): Promise<void> {
  const res = await fetch(`${base(projectId)}/${committeeId}/members/${memberId}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error(await safeError(res))
}
