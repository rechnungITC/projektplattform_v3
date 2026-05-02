/**
 * Shared mail-title sanitizer.
 *
 * Originally introduced in PROJ-31 as `sanitizeApprovalTitle` in
 * `src/lib/decisions/approval-mail.ts`. PROJ-33 Phase 33-δ extracted it as
 * a shared utility (Optimization O2 from the spec) so the Self-Assessment
 * mail-builder can reuse it without duplication.
 *
 * Strips email-shaped sub-strings and phone-number-shaped sub-strings —
 * patterns common in V2-imported titles. Returns null if the input is
 * empty after trim or longer than `maxLen` (default 200).
 */

const DEFAULT_MAX_LEN = 200

export interface SanitizeMailTitleOptions {
  /** Reject titles longer than this many characters. Default 200. */
  maxLen?: number
}

export function sanitizeMailTitle(
  raw: string,
  options: SanitizeMailTitleOptions = {},
): string | null {
  const maxLen = options.maxLen ?? DEFAULT_MAX_LEN
  if (typeof raw !== "string") return null
  let s = raw.trim()
  if (s.length === 0) return null

  // Strip emails.
  s = s.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[…]")
  // Strip phone-number-ish sequences (5+ digits, spaces/dashes allowed).
  s = s.replace(/(?:\+?\d[\d\s\-/]{4,}\d)/g, "[…]")

  if (s.length > maxLen) return null
  return s
}
