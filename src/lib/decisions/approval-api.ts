/**
 * PROJ-31 — fetch wrappers for the Approval-Gates surface.
 *
 * Endpoints are added by /backend; until then these calls return 4xx and
 * the components surface the error via toast/Alert.
 */

import type {
  ApprovalTokenPayload,
  DecisionApprovalBundle,
  PendingApprovalSummary,
} from "@/types/decision-approval"

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

const decisionBase = (projectId: string, decisionId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/decisions/${encodeURIComponent(
    decisionId,
  )}/approval`

export interface SubmitForApprovalInput {
  approver_stakeholder_ids: string[]
  quorum_required: number
}

export async function submitDecisionForApproval(
  projectId: string,
  decisionId: string,
  input: SubmitForApprovalInput,
): Promise<void> {
  const response = await fetch(decisionBase(projectId, decisionId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await safeError(response))
}

export async function withdrawDecisionApproval(
  projectId: string,
  decisionId: string,
  reason?: string,
): Promise<void> {
  const response = await fetch(`${decisionBase(projectId, decisionId)}/withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: reason ?? null }),
  })
  if (!response.ok) throw new Error(await safeError(response))
}

export async function getDecisionApprovalBundle(
  projectId: string,
  decisionId: string,
): Promise<DecisionApprovalBundle | null> {
  const response = await fetch(decisionBase(projectId, decisionId), {
    method: "GET",
    cache: "no-store",
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { bundle: DecisionApprovalBundle | null }
  return body.bundle ?? null
}

/**
 * Internal Approver-Dashboard query — pending approvals for the logged-in
 * user, joined via stakeholders.linked_user_id.
 */
export async function listPendingApprovals(): Promise<PendingApprovalSummary[]> {
  const response = await fetch("/api/dashboard/approvals", {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { approvals: PendingApprovalSummary[] }
  return body.approvals ?? []
}

/**
 * Internal Approver-Action — Approve/Reject for users with a real session.
 * Maps to the same RPC as the Magic-Link flow, but auth comes via cookies.
 */
export async function respondAsInternalApprover(
  projectId: string,
  decisionId: string,
  approverId: string,
  payload: { response: "approve" | "reject"; comment?: string | null },
): Promise<void> {
  const response = await fetch(
    `${decisionBase(projectId, decisionId)}/respond/${encodeURIComponent(approverId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  )
  if (!response.ok) throw new Error(await safeError(response))
}

// ---------------------------------------------------------------------------
// Public Magic-Link Flow — no auth, token in URL.
// ---------------------------------------------------------------------------

export async function fetchApprovalByToken(
  token: string,
): Promise<ApprovalTokenPayload> {
  const response = await fetch(`/api/approve/${encodeURIComponent(token)}`, {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { payload: ApprovalTokenPayload }
  return body.payload
}

export async function respondViaToken(
  token: string,
  payload: { response: "approve" | "reject"; comment?: string | null },
): Promise<void> {
  const response = await fetch(`/api/approve/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(await safeError(response))
}
