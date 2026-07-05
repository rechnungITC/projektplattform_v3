/**
 * PROJ-105 α — fetch wrappers for the deliverable approval workflow: list
 * workflows + history, submit for approval, respond (approve/reject), withdraw,
 * and the My-Work pending surface. Consumed by the /frontend Freigabe section.
 */

import type {
  DeliverableApproval,
  DeliverableApprovalStageResponse,
  PendingDeliverableApprovalSummary,
} from "@/types/deliverable-approval-workflow"

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

function base(projectId: string, did: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/deliverables/${encodeURIComponent(did)}/approval`
}

export async function listDeliverableApprovals(
  projectId: string,
  did: string
): Promise<DeliverableApproval[]> {
  const res = await fetch(base(projectId, did), { method: "GET", cache: "no-store" })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { approvals: DeliverableApproval[] }).approvals
}

export async function submitDeliverableForApproval(
  projectId: string,
  did: string,
  approverStakeholderIds: string[]
): Promise<DeliverableApproval> {
  const res = await fetch(base(projectId, did), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approver_stakeholder_ids: approverStakeholderIds }),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { approval: DeliverableApproval }).approval
}

export async function respondToDeliverableApproval(
  projectId: string,
  did: string,
  stageId: string,
  response: DeliverableApprovalStageResponse,
  comment?: string
): Promise<DeliverableApproval> {
  const res = await fetch(`${base(projectId, did)}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage_id: stageId, response, comment }),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { approval: DeliverableApproval }).approval
}

export async function withdrawDeliverableApproval(
  projectId: string,
  did: string,
  approvalId: string
): Promise<DeliverableApproval> {
  const res = await fetch(`${base(projectId, did)}/withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approval_id: approvalId }),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { approval: DeliverableApproval }).approval
}

/** My-Work: deliverable approvals awaiting the current user as active approver. */
export async function listMyDeliverableApprovals(): Promise<
  PendingDeliverableApprovalSummary[]
> {
  const res = await fetch("/api/dashboard/deliverable-approvals", {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { approvals: PendingDeliverableApprovalSummary[] })
    .approvals
}
