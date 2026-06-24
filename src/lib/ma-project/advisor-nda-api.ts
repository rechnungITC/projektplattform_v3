/**
 * PROJ-99 / PROJ-128 / PROJ-129 — fetch wrappers for the confidentiality
 * bundle: external advisor profiles, the NDA register + assignments, and the
 * read-only "who can see this, and why?" access-explain matrix. Consumed by the
 * /frontend slice (Governance & Access page in the M&A project room).
 */

import type { MaConfidentialityLevel } from "@/types/confidentiality"

export type AdvisorType =
  | "legal"
  | "tax"
  | "financial"
  | "commercial"
  | "it"
  | "hr"
  | "other"

export type MandateStatus = "planned" | "active" | "expired" | "blocked"

export type NdaStatus =
  | "draft"
  | "in_review"
  | "valid"
  | "expired"
  | "revoked"

export type NdaScopeKind =
  | "project"
  | "phase"
  | "dd_stream"
  | "advisor_group"
  | "person"

export interface AdvisorProfile {
  id: string
  tenant_id: string
  project_id: string
  user_id: string
  organization: string
  advisor_type: AdvisorType
  mandate_start: string | null
  mandate_end: string | null
  mandate_status: MandateStatus
  responsible_user_id: string | null
  scope: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Nda {
  id: string
  tenant_id: string
  project_id: string
  counterparty: string
  responsible_user_id: string | null
  status: NdaStatus
  signed_date: string | null
  valid_from: string | null
  valid_until: string | null
  scope_kind: NdaScopeKind
  scope_ref: string | null
  covered_level: MaConfidentialityLevel
  document_link: string | null
  reminder_date: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface NdaAssignment {
  id: string
  tenant_id: string
  nda_id: string
  project_id: string
  user_id: string | null
  contact_name: string | null
  contact_org: string | null
  created_by: string | null
  created_at: string
}

export type AccessReason =
  | "baseline"
  | "admin"
  | "cleared"
  | "no_clearance"
  | "mandate_inactive"
  | "nda_missing"

export interface AccessExplainEntry {
  user_id: string
  is_member: boolean
  is_external_advisor: boolean
  mandate_ok: boolean
  nda_ok: boolean
  cleared_level: MaConfidentialityLevel | null
  has_access: boolean
  reason: AccessReason
}

export interface AccessExplain {
  object_type: "project" | "phase" | "work_item"
  object_id: string
  confidentiality_level: MaConfidentialityLevel
  entries: AccessExplainEntry[]
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

function p(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}`
}

// --- Advisor profiles (PROJ-99) -------------------------------------------

export async function listAdvisors(projectId: string): Promise<AdvisorProfile[]> {
  const res = await fetch(`${p(projectId)}/advisors`, {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { advisors: AdvisorProfile[] }).advisors
}

export interface CreateAdvisorPayload {
  user_id: string
  organization: string
  advisor_type: AdvisorType
  mandate_start?: string | null
  mandate_end?: string | null
  mandate_status?: MandateStatus
  responsible_user_id?: string | null
  scope?: string | null
  notes?: string | null
}

export async function createAdvisor(
  projectId: string,
  payload: CreateAdvisorPayload
): Promise<AdvisorProfile> {
  const res = await fetch(`${p(projectId)}/advisors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { advisor: AdvisorProfile }).advisor
}

export type UpdateAdvisorPayload = Partial<Omit<CreateAdvisorPayload, "user_id">>

export async function updateAdvisor(
  projectId: string,
  advisorId: string,
  payload: UpdateAdvisorPayload
): Promise<AdvisorProfile> {
  const res = await fetch(
    `${p(projectId)}/advisors/${encodeURIComponent(advisorId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { advisor: AdvisorProfile }).advisor
}

export async function deleteAdvisor(
  projectId: string,
  advisorId: string
): Promise<void> {
  const res = await fetch(
    `${p(projectId)}/advisors/${encodeURIComponent(advisorId)}`,
    { method: "DELETE" }
  )
  if (!res.ok) throw new Error(await safeError(res))
}

// --- NDA register (PROJ-128) ----------------------------------------------

export async function listNdas(projectId: string): Promise<Nda[]> {
  const res = await fetch(`${p(projectId)}/ndas`, {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { ndas: Nda[] }).ndas
}

export interface CreateNdaPayload {
  counterparty: string
  responsible_user_id?: string | null
  status?: NdaStatus
  signed_date?: string | null
  valid_from?: string | null
  valid_until?: string | null
  scope_kind?: NdaScopeKind
  scope_ref?: string | null
  covered_level?: MaConfidentialityLevel
  document_link?: string | null
  reminder_date?: string | null
  notes?: string | null
}

export async function createNda(
  projectId: string,
  payload: CreateNdaPayload
): Promise<Nda> {
  const res = await fetch(`${p(projectId)}/ndas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { nda: Nda }).nda
}

export type UpdateNdaPayload = Partial<CreateNdaPayload>

export async function updateNda(
  projectId: string,
  ndaId: string,
  payload: UpdateNdaPayload
): Promise<Nda> {
  const res = await fetch(`${p(projectId)}/ndas/${encodeURIComponent(ndaId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { nda: Nda }).nda
}

export async function deleteNda(
  projectId: string,
  ndaId: string
): Promise<void> {
  const res = await fetch(`${p(projectId)}/ndas/${encodeURIComponent(ndaId)}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error(await safeError(res))
}

// --- NDA assignments (PROJ-128) -------------------------------------------

export async function listNdaAssignments(
  projectId: string,
  ndaId: string
): Promise<NdaAssignment[]> {
  const res = await fetch(
    `${p(projectId)}/ndas/${encodeURIComponent(ndaId)}/assignments`,
    { method: "GET", cache: "no-store" }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { assignments: NdaAssignment[] }).assignments
}

export interface AssignNdaPayload {
  user_id?: string | null
  contact_name?: string | null
  contact_org?: string | null
}

export async function assignNda(
  projectId: string,
  ndaId: string,
  payload: AssignNdaPayload
): Promise<NdaAssignment> {
  const res = await fetch(
    `${p(projectId)}/ndas/${encodeURIComponent(ndaId)}/assignments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { assignment: NdaAssignment }).assignment
}

export async function deleteNdaAssignment(
  projectId: string,
  ndaId: string,
  assignmentId: string
): Promise<void> {
  const res = await fetch(
    `${p(projectId)}/ndas/${encodeURIComponent(ndaId)}/assignments/${encodeURIComponent(
      assignmentId
    )}`,
    { method: "DELETE" }
  )
  if (!res.ok) throw new Error(await safeError(res))
}

// --- Access-explain matrix (PROJ-129) -------------------------------------

/** Read-only "who can see this object, and why?" (manager-gated server-side). */
export async function fetchAccessExplain(
  projectId: string,
  opts: {
    objectType?: "project" | "phase" | "work_item"
    objectId?: string
    level?: MaConfidentialityLevel
  } = {}
): Promise<AccessExplain> {
  const params = new URLSearchParams()
  if (opts.level) {
    params.set("level", opts.level)
  } else {
    params.set("objectType", opts.objectType ?? "project")
    if (opts.objectId) params.set("objectId", opts.objectId)
  }
  const res = await fetch(
    `${p(projectId)}/access-explain?${params.toString()}`,
    { method: "GET", cache: "no-store" }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return (await res.json()) as AccessExplain
}
