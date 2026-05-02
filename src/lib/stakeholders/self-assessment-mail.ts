/**
 * PROJ-33 Phase 33-δ — Self-Assessment-mail builder.
 *
 * Privacy guard analog PROJ-31 `buildApprovalOutboxRow`:
 *
 * - The mail body contains NO project-context, NO decision-bodies, NO
 *   stakeholder-details beyond the recipient's own first name + the
 *   tenant-branding name. The link is the only payload.
 * - The first name is sanitized through the shared `sanitizeMailTitle`
 *   util (strips embedded emails/phones; max 80 chars). Empty/oversized
 *   first names degrade gracefully to a generic salutation.
 * - The token is signed by `self-assessment-token.ts`; the URL points
 *   at the public `/self-assessment/[token]` page.
 *
 * Code-review pledge: any future caller queueing a Self-Assessment mail
 * MUST go through this builder. Direct `communication_outbox` inserts
 * for self-assessments are forbidden.
 */

import { sanitizeMailTitle } from "@/lib/comms/mail-sanitize"

export interface BuildSelfAssessmentOutboxRowInput {
  tenantId: string
  /** Project context — used only for outbox routing, never inserted into
   *  the mail body (Privacy by Design). */
  projectId: string
  stakeholderId: string
  inviteId: string
  /** Stakeholder's first name. Will be sanitized; if rejected, falls
   *  back to "Hallo". */
  firstName: string | null
  /** Tenant display name (e.g. tenant_settings.branding_name). Falls
   *  back to "Projektplattform" if missing. */
  tenantBrandingName: string | null
  /** External recipient email — required, otherwise the caller skips
   *  queueing. */
  recipient: string
  /** Server-issued Magic-Link token (already signed by
   *  self-assessment-token.ts). */
  token: string
  /** Public base URL the link points at. */
  baseUrl: string
  createdBy: string
}

export interface SelfAssessmentOutboxRow {
  tenant_id: string
  project_id: string
  channel: "email"
  recipient: string
  subject: string
  body: string
  metadata: {
    purpose: "self_assessment_invite"
    stakeholder_id: string
    invite_id: string
  }
  status: "queued"
  created_by: string
}

const FIRST_NAME_MAX_LEN = 80
const BRANDING_FALLBACK = "Projektplattform"
const SALUTATION_FALLBACK = "Hallo"

/**
 * Extract a Vorname-only safe salutation. Strategy:
 *   1. Trim + strip emails/phones via `sanitizeMailTitle` (max 80 chars).
 *   2. Take the first whitespace-separated token (so "Anna Müller" →
 *      "Anna"). This shortens the surface area further.
 *   3. Reject if empty or contains characters outside a conservative
 *      whitelist; fall back to "Hallo".
 */
export function sanitizeFirstName(raw: string | null): string {
  if (!raw) return SALUTATION_FALLBACK
  const sanitized = sanitizeMailTitle(raw, { maxLen: FIRST_NAME_MAX_LEN })
  if (!sanitized) return SALUTATION_FALLBACK
  const firstToken = sanitized.split(/\s+/)[0] ?? ""
  if (firstToken.length === 0) return SALUTATION_FALLBACK
  // Allow letters (unicode), digits, hyphens, apostrophes — strip anything else.
  const cleaned = firstToken.replace(/[^\p{L}\p{N}\-']/gu, "")
  if (cleaned.length === 0) return SALUTATION_FALLBACK
  return cleaned
}

export function buildSelfAssessmentOutboxRow(
  input: BuildSelfAssessmentOutboxRowInput,
): SelfAssessmentOutboxRow {
  if (!input.token || !input.baseUrl) {
    throw new Error(
      "buildSelfAssessmentOutboxRow: token and baseUrl are required.",
    )
  }
  if (!input.recipient) {
    throw new Error("buildSelfAssessmentOutboxRow: recipient is required.")
  }

  const firstName = sanitizeFirstName(input.firstName)
  const branding =
    sanitizeMailTitle(input.tenantBrandingName ?? "", { maxLen: 120 }) ??
    BRANDING_FALLBACK

  const url = `${input.baseUrl.replace(/\/$/, "")}/self-assessment/${encodeURIComponent(input.token)}`

  // The body is intentionally template-only. NO project name, NO decision
  // body, NO data about other stakeholders. This is the Privacy defense.
  const body = [
    `${firstName === SALUTATION_FALLBACK ? firstName : `Hallo ${firstName}`},`,
    "",
    `${branding} bittet Sie um eine kurze Selbst-Einschätzung Ihrer fachlichen`,
    "und persönlichen Ausprägungen für die Projektzusammenarbeit.",
    "",
    "Die Erhebung dauert ca. 5 Minuten und besteht aus 10 Schiebereglern.",
    "Sie müssen sich nicht einloggen — der folgende Link ist für Sie reserviert",
    "und 14 Tage gültig.",
    "",
    url,
    "",
    `— ${branding} · Self-Assessment-Workflow`,
  ].join("\n")

  return {
    tenant_id: input.tenantId,
    project_id: input.projectId,
    channel: "email",
    recipient: input.recipient,
    subject: `Self-Assessment-Anfrage von ${branding}`,
    body,
    metadata: {
      purpose: "self_assessment_invite",
      stakeholder_id: input.stakeholderId,
      invite_id: input.inviteId,
    },
    status: "queued",
    created_by: input.createdBy,
  }
}
