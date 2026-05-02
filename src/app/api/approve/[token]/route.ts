/**
 * PROJ-31 — Public Magic-Link approve endpoint.
 *
 * GET  /api/approve/[token]          → fetch token-payload (public, token-auth)
 * POST /api/approve/[token]          → respond approve|reject (public, token-auth)
 *
 * Uses the service-role admin client because the request has no Supabase
 * session — the token is the only auth gate. Validation order:
 *   1. HMAC signature (approval-token.ts)
 *   2. expiry (approval-token.ts)
 *   3. tenant_id match (DB row vs token claim)
 *   4. approver row exists, decision_id matches
 *   5. decision_approval_state.status = 'pending'
 *   6. decisions.is_revised = false
 *
 * Class-3-defense: the token only lets the holder read THIS decision's
 * body — no cross-decision listing, no approver-list discovery.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError } from "@/app/api/_lib/route-helpers"
import { verifyApprovalToken } from "@/lib/decisions/approval-token"
import { createAdminClient } from "@/lib/supabase/admin"

const respondSchema = z.object({
  response: z.enum(["approve", "reject"]),
  comment: z.string().trim().max(4000).nullable().optional(),
})

interface Ctx {
  params: Promise<{ token: string }>
}

interface ResolvedToken {
  approverId: string
  decisionId: string
  tenantId: string
  expSec: number
}

async function resolveAndValidate(
  token: string,
): Promise<
  | { ok: true; data: ResolvedToken; status: "pending" | "expired" | "blocked" }
  | { ok: false; status: number; error: string }
> {
  const verify = verifyApprovalToken(token)
  if (!verify.ok) {
    if (verify.reason === "expired") {
      return { ok: false, status: 410, error: "expired" }
    }
    return { ok: false, status: 404, error: "not_found" }
  }
  return {
    ok: true,
    data: {
      approverId: verify.payload.approver_id,
      decisionId: verify.payload.decision_id,
      tenantId: verify.payload.tenant_id,
      expSec: verify.payload.exp,
    },
    status: "pending",
  }
}

export async function GET(_request: Request, ctx: Ctx) {
  const { token } = await ctx.params
  const resolved = await resolveAndValidate(token)
  if (!resolved.ok) {
    return apiError(resolved.error, "Token invalid or expired.", resolved.status)
  }
  const { approverId, decisionId, tenantId } = resolved.data

  const admin = createAdminClient()

  // Fetch approver row + decision + state with a single round-trip.
  const [approverRes, decisionRes, stateRes] = await Promise.all([
    admin
      .from("decision_approvers")
      .select(
        "id, tenant_id, decision_id, magic_link_token, magic_link_expires_at, response, " +
          "stakeholders!decision_approvers_stakeholder_id_fkey(name)",
      )
      .eq("id", approverId)
      .maybeSingle(),
    admin
      .from("decisions")
      .select("id, tenant_id, title, decision_text, rationale, decided_at, is_revised")
      .eq("id", decisionId)
      .maybeSingle(),
    admin
      .from("decision_approval_state")
      .select("status, quorum_required")
      .eq("decision_id", decisionId)
      .maybeSingle(),
  ])
  if (approverRes.error) return apiError("internal_error", approverRes.error.message, 500)
  if (decisionRes.error) return apiError("internal_error", decisionRes.error.message, 500)
  if (stateRes.error) return apiError("internal_error", stateRes.error.message, 500)

  type ApproverRow = {
    id: string
    tenant_id: string
    decision_id: string
    magic_link_token: string
    magic_link_expires_at: string | null
    response: string | null
    stakeholders?: { name?: string } | null
  }
  const approver = approverRes.data as unknown as ApproverRow | null
  const decision = decisionRes.data
  const state = stateRes.data

  if (!approver || !decision || !state) {
    return apiError("not_found", "Approval not found.", 404)
  }
  if (
    approver.tenant_id !== tenantId ||
    decision.tenant_id !== tenantId ||
    approver.decision_id !== decisionId
  ) {
    return apiError("not_found", "Token tenant mismatch.", 404)
  }
  if (approver.magic_link_token !== token) {
    return apiError("not_found", "Token has been replaced or revoked.", 404)
  }

  // Token replay after revision: refuse.
  if (decision.is_revised) {
    return apiError("gone", "Decision has been revised.", 410)
  }

  // Approver may already have responded.
  const alreadyResponded = approver.response !== null

  // Counts for the public payload — we don't expose approver names, only
  // the aggregate.
  const { data: counts, error: cntErr } = await admin
    .from("decision_approvers")
    .select("response")
    .eq("decision_id", decisionId)
  if (cntErr) return apiError("internal_error", cntErr.message, 500)
  const quorumReceivedApprovals =
    counts?.filter((r) => r.response === "approve").length ?? 0
  const quorumReceivedRejections =
    counts?.filter((r) => r.response === "reject").length ?? 0

  const stakeholderRel = (approver?.stakeholders ?? null) as
    | { name?: string }
    | null
  const expired =
    !!approver.magic_link_expires_at &&
    new Date(approver.magic_link_expires_at).getTime() < Date.now()

  return NextResponse.json({
    payload: {
      decision: {
        id: decision.id,
        title: decision.title,
        decision_text: decision.decision_text,
        rationale: decision.rationale,
        decided_at: decision.decided_at,
      },
      approver: {
        id: approver.id,
        stakeholder_name: stakeholderRel?.name ?? "Approver",
      },
      state: {
        status: state.status,
        quorum_required: state.quorum_required ?? 1,
        quorum_received_approvals: quorumReceivedApprovals,
        quorum_received_rejections: quorumReceivedRejections,
      },
      alreadyResponded,
      expired,
    },
  })
}

export async function POST(request: Request, ctx: Ctx) {
  const { token } = await ctx.params
  const resolved = await resolveAndValidate(token)
  if (!resolved.ok) {
    return apiError(resolved.error, "Token invalid or expired.", resolved.status)
  }
  const { approverId, decisionId, tenantId } = resolved.data

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = respondSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_error", "Invalid request body.", 400)
  }

  const admin = createAdminClient()

  // Cross-validate: token must match the persisted token, and the
  // tenant + decision must agree.
  const { data: approverData, error: apErr } = await admin
    .from("decision_approvers")
    .select("id, tenant_id, decision_id, magic_link_token, response, magic_link_expires_at")
    .eq("id", approverId)
    .maybeSingle()
  if (apErr) return apiError("internal_error", apErr.message, 500)
  type ApproverRowMin = {
    id: string
    tenant_id: string
    decision_id: string
    magic_link_token: string
    response: string | null
    magic_link_expires_at: string | null
  }
  const approver = approverData as unknown as ApproverRowMin | null
  if (!approver) return apiError("not_found", "Approver not found.", 404)
  if (approver.magic_link_token !== token) {
    return apiError("not_found", "Token has been replaced or revoked.", 404)
  }
  if (approver.tenant_id !== tenantId || approver.decision_id !== decisionId) {
    return apiError("not_found", "Token tenant mismatch.", 404)
  }
  if (approver.response !== null) {
    return apiError("conflict", "Already responded.", 409)
  }
  if (
    approver.magic_link_expires_at &&
    new Date(approver.magic_link_expires_at).getTime() < Date.now()
  ) {
    return apiError("gone", "Token expired.", 410)
  }

  // Defensive recheck: decision not revised, state pending.
  const [{ data: decision }, { data: state }] = await Promise.all([
    admin
      .from("decisions")
      .select("is_revised")
      .eq("id", decisionId)
      .maybeSingle(),
    admin
      .from("decision_approval_state")
      .select("status")
      .eq("decision_id", decisionId)
      .maybeSingle(),
  ])
  if (!decision || decision.is_revised) {
    return apiError("gone", "Decision has been revised.", 410)
  }
  if (!state || state.status !== "pending") {
    return apiError("conflict", `Not pending: ${state?.status ?? "unknown"}.`, 409)
  }

  // Hand off to the RPC for advisory-locked quorum update.
  const { error: rpcErr } = await admin.rpc("record_approval_response", {
    p_decision_id: decisionId,
    p_approver_id: approverId,
    p_response: parsed.data.response,
    p_comment: parsed.data.comment ?? null,
    p_actor_user_id: null, // magic-link flow has no platform user
  })
  if (rpcErr) {
    return apiError("internal_error", rpcErr.message, 500)
  }

  return NextResponse.json({ ok: true })
}
