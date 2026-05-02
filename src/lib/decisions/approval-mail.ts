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
 * Code review pledge: any new caller of communication_outbox insert from
 * the approval flow MUST go through this builder. Direct inserts at other
 * call sites are forbidden by code review, not by the DB.
 */

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

const TITLE_MAX_LEN = 200

/**
 * Sanitize the title to prevent PII / Class-3 leakage.
 *
 * Strips email-shaped sub-strings and phone-number-shaped sub-strings
 * (patterns common in V2-imported Decision titles). Rejects (returns null)
 * if the title is too long or empty after trim.
 */
export function sanitizeApprovalTitle(raw: string): string | null {
  if (typeof raw !== "string") return null
  let s = raw.trim()
  if (s.length === 0) return null

  // Strip emails.
  s = s.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[…]")
  // Strip phone-number-ish sequences (5+ digits, spaces/dashes allowed).
  s = s.replace(/(?:\+?\d[\d\s\-/]{4,}\d)/g, "[…]")

  if (s.length > TITLE_MAX_LEN) return null
  return s
}

export function buildApprovalOutboxRow(
  input: BuildApprovalOutboxRowInput,
): ApprovalOutboxRow {
  const safeTitle = sanitizeApprovalTitle(input.decisionTitle)
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
