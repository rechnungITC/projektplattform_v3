/**
 * PROJ-100c — fetch wrappers for the 4-eyes clearance-approval surface:
 * the per-(tenant,level) approval policy catalog, the tenant approver pool, and
 * the pending clearance-approval requests + respond/cancel actions. Consumed by
 * the /frontend slice (policy admin + the "wartet auf Genehmigung" list).
 */

import type { MaConfidentialityLevel } from "@/types/confidentiality"

export type GatedLevel = Exclude<MaConfidentialityLevel, "standard">

export interface ClearanceApprovalPolicy {
  id: string
  tenant_id: string
  level: MaConfidentialityLevel
  enabled: boolean
  persons_required: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ClearanceApprover {
  id: string
  tenant_id: string
  level: MaConfidentialityLevel | null
  approver_user_id: string
  created_by: string | null
  created_at: string
}

export type ClearanceRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"

export interface ClearanceGrantRequest {
  id: string
  tenant_id: string
  project_id: string
  user_id: string
  requested_level: MaConfidentialityLevel
  applied_profile_id: string | null
  valid_until: string | null
  requested_by: string
  quorum_required: number
  status: ClearanceRequestStatus
  granted_clearance_id: string | null
  created_at: string
  decided_at: string | null
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

// --- Policy catalog (tenant-admin) ---------------------------------------
export async function listApprovalPolicies(): Promise<ClearanceApprovalPolicy[]> {
  const res = await fetch("/api/clearance-approval-policies", { cache: "no-store" })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { policies: ClearanceApprovalPolicy[] }).policies
}

export async function upsertApprovalPolicy(input: {
  level: GatedLevel
  enabled: boolean
  persons_required: number
}): Promise<ClearanceApprovalPolicy> {
  const res = await fetch("/api/clearance-approval-policies", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { policy: ClearanceApprovalPolicy }).policy
}

// --- Approver pool (tenant-admin) ----------------------------------------
export async function listApprovers(): Promise<ClearanceApprover[]> {
  const res = await fetch("/api/clearance-approvers", { cache: "no-store" })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { approvers: ClearanceApprover[] }).approvers
}

export async function addApprover(input: {
  approver_user_id: string
  level?: GatedLevel | null
}): Promise<ClearanceApprover> {
  const res = await fetch("/api/clearance-approvers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { approver: ClearanceApprover }).approver
}

export async function removeApprover(approverId: string): Promise<void> {
  const res = await fetch(
    `/api/clearance-approvers/${encodeURIComponent(approverId)}`,
    { method: "DELETE" }
  )
  if (!res.ok) throw new Error(await safeError(res))
}

// --- Requests (project members read; approvers respond) ------------------
export async function listClearanceRequests(
  projectId: string,
  status?: ClearanceRequestStatus
): Promise<ClearanceGrantRequest[]> {
  const qs = status ? `?status=${status}` : ""
  const res = await fetch(`${p(projectId)}/clearance-requests${qs}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { requests: ClearanceGrantRequest[] }).requests
}

export async function respondToClearanceRequest(
  projectId: string,
  reqId: string,
  action: "approve" | "reject"
): Promise<ClearanceGrantRequest> {
  const res = await fetch(
    `${p(projectId)}/clearance-requests/${encodeURIComponent(reqId)}/respond`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { request: ClearanceGrantRequest }).request
}

export async function cancelClearanceRequest(
  projectId: string,
  reqId: string
): Promise<ClearanceGrantRequest> {
  const res = await fetch(
    `${p(projectId)}/clearance-requests/${encodeURIComponent(reqId)}/cancel`,
    { method: "POST" }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { request: ClearanceGrantRequest }).request
}
