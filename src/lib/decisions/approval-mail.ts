/**
 * PROJ-31 — Approval-mail builder.
 *
 * Class-3 hard-constraint guard: this module is the *only* place where
 * Approval-Mails are constructed. The PROJ-13 outbox-service Class-3 block
 * is `ki_run_id`-driven and would NOT block an Approval-Mail referencing a
 * Class-3 Decision. The defense is "Decision-Body never enters the
 * Approval-Mail" — enforced via a strict input whitelist (sanitized title +
 * approval URL only).
 *
 * PROJ-33 Phase 33-δ extracted the title-sanitizer to
 * `@/lib/comms/mail-sanitize` so the Self-Assessment mail-builder can
 * reuse it. `sanitizeApprovalTitle` is preserved as a thin re-export to
 * keep existing imports + tests working unchanged.
 *
 * Code review pledge: any new caller of communication_outbox insert from
 * the approval flow MUST go through this builder. Direct inserts at other
 * call sites are forbidden by code review, not by the DB.
 */

import { sanitizeMailTitle } from "@/lib/comms/mail-sanitize"

export interface BuildApprovalOutboxRowInput {
  tenantId: string
  projectId: string
  decisionId: string
  approverId: string
  /** Sanitized decision title — caller is responsible for trimming and
   *  removing PII patterns. Max 200 chars; rejected if longer. */
  decisionTitle: string
  /** External recipient — typically the stakeholder's contact email. */
  recipient: string
  /** Server-issued Magic-Link token (already signed by approval-token.ts). */
  token: string
  /** Public base URL the link points at. Defaults to PROJECT_PUBLIC_URL env
   *  if omitted; the production deploy MUST set this. */
  baseUrl: string
  createdBy: string
}

export interface ApprovalOutboxRow {
  tenant_id: string
  project_id: string
  channel: "email"
  recipient: string
  subject: string
  body: string
  metadata: {
    purpose: "approval_magic_link"
    decision_id: string
    approver_id: string
  }
  status: "queued"
  created_by: string
}

/**
 * Backwards-compatible alias for the shared `sanitizeMailTitle`. Existing
 * imports of `sanitizeApprovalTitle` continue to work; new callers should
 * import directly from `@/lib/comms/mail-sanitize`.
 */
export function sanitizeApprovalTitle(raw: string): string | null {
  return sanitizeMailTitle(raw)
}

export function buildApprovalOutboxRow(
  input: BuildApprovalOutboxRowInput,
): ApprovalOutboxRow {
  const safeTitle = sanitizeMailTitle(input.decisionTitle)
  if (!safeTitle) {
    throw new Error(
      "buildApprovalOutboxRow: decision title rejected by sanitizer (empty, too long, or PII-shaped).",
    )
  }
  if (!input.token || !input.baseUrl) {
    throw new Error("buildApprovalOutboxRow: token and baseUrl are required.")
  }

  const url = `${input.baseUrl.replace(/\/$/, "")}/approve/${encodeURIComponent(input.token)}`

  // The body is intentionally template-only. NO Decision body, NO rationale,
  // NO stakeholder details beyond the link. This is the Class-3 defense.
  const body = [
    "Sie wurden als Approver für eine formale Entscheidung nominiert.",
    "",
    `Entscheidung: ${safeTitle}`,
    "",
    "Bitte öffnen Sie den folgenden Link, um zuzustimmen oder abzulehnen.",
    "Der Link ist 7 Tage gültig und nur für Ihre Antwort gedacht.",
    "",
    url,
    "",
    "— Projektplattform · Genehmigungs-Workflow",
  ].join("\n")

  return {
    tenant_id: input.tenantId,
    project_id: input.projectId,
    channel: "email",
    recipient: input.recipient,
    subject: `Genehmigungs-Anfrage: ${safeTitle}`,
    body,
    metadata: {
      purpose: "approval_magic_link",
      decision_id: input.decisionId,
      approver_id: input.approverId,
    },
    status: "queued",
    created_by: input.createdBy,
  }
}
