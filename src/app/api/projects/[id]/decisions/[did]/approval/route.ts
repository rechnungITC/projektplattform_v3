/**
 * PROJ-31 — GET (bundle) + POST (submit-for-approval) for one decision.
 *
 * GET  /api/projects/[id]/decisions/[did]/approval
 *      Returns { bundle: { state, approvers, events } | null }
 *
 * POST /api/projects/[id]/decisions/[did]/approval
 *      Body: { approver_stakeholder_ids: string[], quorum_required: int }
 *      Submits the decision for approval: creates state row, approver rows
 *      with magic-link tokens, audit event, and queues approval mails.
 */

import crypto from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { buildApprovalOutboxRow } from "@/lib/decisions/approval-mail"
import { signApprovalToken } from "@/lib/decisions/approval-token"

const submitSchema = z.object({
  approver_stakeholder_ids: z.array(z.string().uuid()).min(1).max(20),
  quorum_required: z.number().int().min(1).max(20),
})

const TOKEN_LIFETIME_DAYS = 7

interface Ctx {
  params: Promise<{ id: string; did: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id: projectId, did: decisionId } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  // Fetch state — may not exist (decision still draft).
  const { data: state, error: stateErr } = await supabase
    .from("decision_approval_state")
    .select(
      "decision_id, tenant_id, status, quorum_required, submitted_at, decided_at",
    )
    .eq("decision_id", decisionId)
    .maybeSingle()
  if (stateErr) return apiError("internal_error", stateErr.message, 500)
  if (!state) return NextResponse.json({ bundle: null })

  const [approversRes, eventsRes] = await Promise.all([
    supabase
      .from("decision_approvers")
      .select(
        "id, decision_id, stakeholder_id, magic_link_expires_at, response, responded_at, comment, request_info_comment, request_info_at, " +
          "stakeholders!decision_approvers_stakeholder_id_fkey(name, linked_user_id)",
      )
      .eq("decision_id", decisionId)
      .order("created_at", { ascending: true }),
    supabase
      .from("decision_approval_events")
      .select(
        "id, decision_id, event_type, actor_user_id, actor_stakeholder_id, payload, created_at",
      )
      .eq("decision_id", decisionId)
      .order("created_at", { ascending: true }),
  ])
  if (approversRes.error)
    return apiError("internal_error", approversRes.error.message, 500)
  if (eventsRes.error)
    return apiError("internal_error", eventsRes.error.message, 500)

  type ApproverRow = {
    id: string
    decision_id: string
    stakeholder_id: string
    magic_link_expires_at: string | null
    response: "approve" | "reject" | "withdrawn" | null
    responded_at: string | null
    comment: string | null
    request_info_comment: string | null
    request_info_at: string | null
    stakeholders?: { name?: string; linked_user_id?: string | null } | null
  }

  const approverRows = (approversRes.data ?? []) as unknown as ApproverRow[]
  const approvers = approverRows.map((row) => {
    const r = row
    return {
      id: r.id,
      decision_id: r.decision_id,
      stakeholder_id: r.stakeholder_id,
      stakeholder_name: r.stakeholders?.name ?? null,
      is_internal: Boolean(r.stakeholders?.linked_user_id),
      linked_user_id: r.stakeholders?.linked_user_id ?? null,
      magic_link_expires_at: r.magic_link_expires_at,
      response: r.response,
      responded_at: r.responded_at,
      comment: r.comment,
      request_info_comment: r.request_info_comment,
      request_info_at: r.request_info_at,
    }
  })

  return NextResponse.json({
    bundle: {
      state,
      approvers,
      events: eventsRes.data ?? [],
    },
  })
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId, did: decisionId } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = submitSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString(),
    )
  }
  const { approver_stakeholder_ids, quorum_required } = parsed.data
  if (quorum_required > approver_stakeholder_ids.length) {
    return apiError(
      "validation_error",
      "quorum_required cannot exceed approver count.",
      400,
      "quorum_required",
    )
  }

  // Verify decision exists, lives in this project + tenant, not revised.
  const { data: decision, error: decErr } = await supabase
    .from("decisions")
    .select("id, project_id, tenant_id, title, is_revised")
    .eq("id", decisionId)
    .maybeSingle()
  if (decErr) return apiError("internal_error", decErr.message, 500)
  if (!decision || decision.project_id !== projectId) {
    return apiError("not_found", "Decision not found in this project.", 404)
  }
  if (decision.is_revised) {
    return apiError(
      "conflict",
      "Cannot submit a revised decision for approval — create a revision first.",
      409,
    )
  }

  // Reject if a state row already exists with non-draft status.
  const { data: existingState } = await supabase
    .from("decision_approval_state")
    .select("status")
    .eq("decision_id", decisionId)
    .maybeSingle()
  if (existingState && existingState.status !== "draft") {
    return apiError(
      "conflict",
      `Decision already has approval status: ${existingState.status}.`,
      409,
    )
  }

  // Verify nominated stakeholders exist, are active, are approvers, and
  // belong to this project (cross-project leak guard).
  const { data: stakeholders, error: stkErr } = await supabase
    .from("stakeholders")
    .select("id, project_id, is_active, is_approver, contact_email, name")
    .in("id", approver_stakeholder_ids)
  if (stkErr) return apiError("internal_error", stkErr.message, 500)
  if (!stakeholders || stakeholders.length !== approver_stakeholder_ids.length) {
    return apiError("validation_error", "One or more approvers not found.", 400)
  }
  const invalid = stakeholders.find(
    (s) =>
      s.project_id !== projectId || !s.is_active || s.is_approver !== true,
  )
  if (invalid) {
    return apiError(
      "validation_error",
      `Approver ${invalid.id} is not eligible (wrong project, inactive, or not flagged is_approver).`,
      400,
    )
  }

  const expiresAt = new Date(
    Date.now() + TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
  )

  // Upsert the state row to 'pending'.
  const { error: stateErr } = await supabase
    .from("decision_approval_state")
    .upsert(
      {
        decision_id: decisionId,
        tenant_id: decision.tenant_id,
        status: "pending",
        quorum_required,
        submitted_at: new Date().toISOString(),
        decided_at: null,
      },
      { onConflict: "decision_id" },
    )
  if (stateErr) return apiError("internal_error", stateErr.message, 500)

  // Build approver rows with placeholder tokens (the row id is needed to
  // sign the token, so we insert first with a temp token, then update).
  const approverRows = approver_stakeholder_ids.map((sid) => ({
    tenant_id: decision.tenant_id,
    decision_id: decisionId,
    stakeholder_id: sid,
    magic_link_token: crypto.randomBytes(16).toString("hex"), // placeholder
    magic_link_expires_at: expiresAt.toISOString(),
  }))
  const { data: insertedApprovers, error: insApErr } = await supabase
    .from("decision_approvers")
    .insert(approverRows)
    .select("id, stakeholder_id")
  if (insApErr) return apiError("internal_error", insApErr.message, 500)

  // Sign one HMAC-token per approver, then UPDATE the placeholder.
  const tokenByApproverId: Record<string, string> = {}
  for (const ap of insertedApprovers ?? []) {
    const token = signApprovalToken({
      approver_id: ap.id,
      decision_id: decisionId,
      tenant_id: decision.tenant_id,
      exp: Math.floor(expiresAt.getTime() / 1000),
    })
    tokenByApproverId[ap.id] = token
    const { error: tokErr } = await supabase
      .from("decision_approvers")
      .update({ magic_link_token: token })
      .eq("id", ap.id)
    if (tokErr) return apiError("internal_error", tokErr.message, 500)
  }

  // Append the submission audit event.
  const { error: evtErr } = await supabase
    .from("decision_approval_events")
    .insert({
      tenant_id: decision.tenant_id,
      decision_id: decisionId,
      event_type: "submitted_for_approval",
      actor_user_id: userId,
      payload: {
        quorum_required,
        approvers: approver_stakeholder_ids.length,
      },
    })
  if (evtErr) return apiError("internal_error", evtErr.message, 500)

  // Queue an outbox row per external approver. Internal approvers see the
  // request in their /approvals dashboard, no email needed (but we still
  // queue one so the link path works for both internal+external uniformly).
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://projektplattform-v3.vercel.app"

  const outboxRows: ReturnType<typeof buildApprovalOutboxRow>[] = []
  for (const ap of insertedApprovers ?? []) {
    const stk = stakeholders.find((s) => s.id === ap.stakeholder_id)
    if (!stk?.contact_email) continue // skip approvers without email
    try {
      outboxRows.push(
        buildApprovalOutboxRow({
          tenantId: decision.tenant_id,
          projectId,
          decisionId,
          approverId: ap.id,
          decisionTitle: decision.title,
          recipient: stk.contact_email,
          token: tokenByApproverId[ap.id]!,
          baseUrl,
          createdBy: userId,
        }),
      )
    } catch {
      // Title-sanitizer rejected. Skip the mail rather than fail the whole
      // submit — the PM can still share the link manually.
    }
  }
  if (outboxRows.length > 0) {
    const { error: outErr } = await supabase
      .from("communication_outbox")
      .insert(outboxRows)
    if (outErr) {
      // Non-fatal: state + approvers + audit are persisted; mail-send
      // failure is logged but doesn't roll back the workflow start.
      console.error("[PROJ-31] outbox insert failed:", outErr.message)
    }
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
