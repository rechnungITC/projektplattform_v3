/**
 * PROJ-31 Round-2 — Project-Feedback helper for Approval-Gates.
 *
 * When an Approver responds to a Decision (approve / reject / request_info),
 * this helper writes the matching project-feedback artifacts so the PM
 * sees the response in the standard project-tooling rather than only in
 * the decision-approval sheet:
 *
 * - **Open-Item** (PROJ-20) — for `reject` and `request_info`. Gives the
 *   PM a tracked clarification artifact with stakeholder linkage. No
 *   Open-Item is created on `approve` (positive consent needs no chase).
 *
 * - **Communication-Outbox row** (PROJ-13) — for all three actions, so the
 *   PM gets a notification e-mail (or in-app message). Falls back to an
 *   `internal` channel row when no e-mail address is on file.
 *
 * Insert failures here are logged but never bubble up — the primary
 * approver response (decision_approvers row + audit event) MUST be
 * persisted regardless of feedback-channel hiccups.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export type ApprovalFeedbackAction = "approve" | "reject" | "request_info"

export interface CreateApprovalFeedbackInput {
  supabase: SupabaseClient
  projectId: string
  tenantId: string
  decisionId: string
  decisionTitle: string
  action: ApprovalFeedbackAction
  approverStakeholderId: string
  approverName: string
  comment: string | null
  createdBy: string
}

export interface ApprovalFeedbackResult {
  open_item_id: string | null
  outbox_id: string | null
  /** Errors encountered while writing the feedback artifacts, if any. */
  errors: Array<{ kind: "open_item" | "outbox" | "responsible_lookup"; message: string }>
}

interface OpenItemTemplate {
  title: string
  description: string
}

interface OutboxTemplate {
  subject: string
  body: string
}

/**
 * Build the Open-Item title + description for a given action.
 * Returns null for `approve` (no open-item is created on approval).
 */
export function buildApprovalOpenItem(
  action: ApprovalFeedbackAction,
  decisionTitle: string,
  approverName: string,
  comment: string | null,
): OpenItemTemplate | null {
  if (action === "approve") return null

  if (action === "reject") {
    return {
      title: `Decision '${decisionTitle}' wurde abgelehnt`,
      description: [
        `Approver ${approverName} hat abgelehnt: ${comment ?? "(ohne Begründung)"}`,
        "",
        "Nächste Schritte: Decision überarbeiten und neue Revision einreichen, oder Decision zurückziehen.",
      ].join("\n"),
    }
  }

  // request_info
  return {
    title: `Approver ${approverName} benötigt mehr Informationen zu '${decisionTitle}'`,
    description: [
      comment ?? "(keine Frage angegeben)",
      "",
      "Nächste Schritte: Informationen bereitstellen und Approver kontaktieren.",
    ].join("\n"),
  }
}

/**
 * Build the Communication-Outbox subject + body for a given action.
 */
export function buildApprovalOutboxTemplate(
  action: ApprovalFeedbackAction,
  decisionTitle: string,
  approverName: string,
  comment: string | null,
): OutboxTemplate {
  if (action === "approve") {
    const commentBlock = comment ? `\n\nKommentar: ${comment}` : ""
    return {
      subject: `Decision '${decisionTitle}' wurde von ${approverName} genehmigt`,
      body: `${approverName} hat die Decision '${decisionTitle}' genehmigt.${commentBlock}`,
    }
  }
  if (action === "reject") {
    return {
      subject: `Decision '${decisionTitle}' wurde von ${approverName} abgelehnt`,
      body: [
        `${approverName} hat die Decision '${decisionTitle}' abgelehnt.`,
        "",
        `Begründung: ${comment ?? "(ohne Begründung)"}`,
        "",
        "Nächste Schritte: Decision überarbeiten oder zurückziehen.",
      ].join("\n"),
    }
  }
  // request_info
  return {
    subject: `${approverName} bittet um mehr Informationen zu '${decisionTitle}'`,
    body: [
      `${approverName} hat eine Frage zur Decision '${decisionTitle}':`,
      "",
      comment ?? "(keine Frage angegeben)",
      "",
      "Nächste Schritte: Informationen bereitstellen und Approver kontaktieren.",
    ].join("\n"),
  }
}

/**
 * Look up the responsible PM email for a project.
 *
 * Returns `{ recipient, channel }`:
 *   - When the project has a responsible_user_id with an e-mail in
 *     `auth.users.email`, returns that email + `email`-channel.
 *   - When the project has a responsible_user_id but no e-mail, returns
 *     the user-id as recipient + `internal` channel (in-app fallback).
 *   - When no responsible_user_id exists, returns null.
 */
export async function lookupProjectResponsibleRecipient(
  supabase: SupabaseClient,
  projectId: string,
): Promise<{ recipient: string; channel: "email" | "internal" } | null> {
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("responsible_user_id")
    .eq("id", projectId)
    .maybeSingle()
  if (projErr || !project?.responsible_user_id) return null

  // auth.users is not directly readable by all RLS-bound clients — try a
  // user-profile join first, fall back to the in-app channel using the
  // user-id as recipient.
  type ProfileRow = { email: string | null }
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("email")
    .eq("user_id", project.responsible_user_id)
    .maybeSingle<ProfileRow>()

  if (profile?.email) {
    return { recipient: profile.email, channel: "email" }
  }

  return {
    recipient: project.responsible_user_id as string,
    channel: "internal",
  }
}

/**
 * Persist the project-feedback artifacts (open_item + outbox) for a
 * single approver-response. Returns the created ids + any errors.
 *
 * Caller is responsible for already having validated authorization and
 * persisted the decision_approvers / decision_approval_events rows. This
 * helper only writes the secondary feedback artifacts.
 */
export async function createApprovalFeedback(
  input: CreateApprovalFeedbackInput,
): Promise<ApprovalFeedbackResult> {
  const result: ApprovalFeedbackResult = {
    open_item_id: null,
    outbox_id: null,
    errors: [],
  }

  // ----- 1) Open-Item (skipped on `approve`) -----
  const oiTemplate = buildApprovalOpenItem(
    input.action,
    input.decisionTitle,
    input.approverName,
    input.comment,
  )
  if (oiTemplate) {
    const { data: oiRow, error: oiErr } = await input.supabase
      .from("open_items")
      .insert({
        tenant_id: input.tenantId,
        project_id: input.projectId,
        title: oiTemplate.title,
        description: oiTemplate.description,
        status: "open",
        contact_stakeholder_id: input.approverStakeholderId,
        created_by: input.createdBy,
      })
      .select("id")
      .single()
    if (oiErr) {
      console.warn(
        `[PROJ-31] open_item insert failed for decision ${input.decisionId}: ${oiErr.message}`,
      )
      result.errors.push({ kind: "open_item", message: oiErr.message })
    } else if (oiRow) {
      result.open_item_id = (oiRow as { id: string }).id
    }
  }

  // ----- 2) Outbox row -----
  const tpl = buildApprovalOutboxTemplate(
    input.action,
    input.decisionTitle,
    input.approverName,
    input.comment,
  )
  const recipientInfo = await lookupProjectResponsibleRecipient(
    input.supabase,
    input.projectId,
  )
  if (!recipientInfo) {
    console.warn(
      `[PROJ-31] outbox skipped for decision ${input.decisionId}: no responsible_user_id on project ${input.projectId}.`,
    )
    result.errors.push({
      kind: "responsible_lookup",
      message: "No responsible_user_id on project — outbox skipped.",
    })
    return result
  }

  const { data: outboxRow, error: outErr } = await input.supabase
    .from("communication_outbox")
    .insert({
      tenant_id: input.tenantId,
      project_id: input.projectId,
      channel: recipientInfo.channel,
      recipient: recipientInfo.recipient,
      subject: tpl.subject,
      body: tpl.body,
      metadata: {
        decision_id: input.decisionId,
        approver_id: input.approverStakeholderId,
        action: input.action,
        source: "proj31_approval_feedback",
      },
      status: "queued",
      created_by: input.createdBy,
    })
    .select("id")
    .single()
  if (outErr) {
    console.warn(
      `[PROJ-31] outbox insert failed for decision ${input.decisionId}: ${outErr.message}`,
    )
    result.errors.push({ kind: "outbox", message: outErr.message })
  } else if (outboxRow) {
    result.outbox_id = (outboxRow as { id: string }).id
  }

  return result
}
