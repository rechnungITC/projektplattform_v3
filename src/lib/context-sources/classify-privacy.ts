/**
 * PROJ-44-γ — auto-classify context source content into a
 * privacy class (1 / 2 / 3).
 *
 * Rules (purely regex-based, no LLM call — Class-3 inputs must
 * never reach an external model):
 *
 *   Class 3 (personal/sensitive) when the content contains:
 *     - an email address (RFC-ish pattern)
 *     - a German national phone number (+49 / 0049 / 0xx prefix)
 *     - an IBAN (DE/AT/CH/FR/NL prefix + 18-22 digits)
 *     - a social-security-style 11-digit token (German SSN)
 *
 *   Class 2 (business-confidential) when the content contains:
 *     - a money amount (xx EUR / xx €)
 *     - a tenant-internal project number pattern (PROJ-N+)
 *     - the words "vertraulich" / "confidential" / "intern" / "secret"
 *
 *   Class 1 otherwise.
 *
 * The function is pure and synchronous. Used by the
 * `/api/context-sources` POST when the client omits
 * `privacy_class`. The DB column still defaults to 3 — so a
 * classifier bypass cannot make personal data Class 1.
 */

import type { DataClass } from "@/types/tenant-settings"

const CLASS_3_PATTERNS: RegExp[] = [
  // Email — keep restrictive to avoid false positives.
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  // Phone numbers (German / international).
  /(?:\+|00)\d{1,3}[\s\-./]?\(?\d{1,4}\)?[\s\-./]?\d{3,10}/,
  /\b0\d{1,4}[\s\-./]?\d{3,10}\b/,
  // IBAN (DE/AT/CH/FR/NL prefix + 16-30 chars).
  /\b(DE|AT|CH|FR|NL)\d{2}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{2,8}\b/i,
  // German SSN (11 digits, typically spaced).
  /\b\d{2}[\s]?\d{6}[\s]?[A-Z][\s]?\d{3}\b/i,
]

const CLASS_2_PATTERNS: RegExp[] = [
  // Currency amounts.
  /\b\d{1,3}([.,]\d{3})*([.,]\d{2})?\s?(EUR|€|USD|\$|CHF|GBP|£)/,
  // Tenant-internal project number.
  /\bPROJ-\d+\b/i,
  // Confidentiality cues.
  /\b(vertraulich|confidential|intern(?:e|al)?|secret|geheim)\b/i,
]

export interface ClassifyInput {
  title: string
  content_excerpt?: string | null
}

export interface ClassifyResult {
  privacy_class: DataClass
  matched_patterns: string[]
}

export function classifyContextSourcePrivacy(
  input: ClassifyInput,
): ClassifyResult {
  const haystack = `${input.title}\n${input.content_excerpt ?? ""}`
  const matched: string[] = []

  for (const re of CLASS_3_PATTERNS) {
    if (re.test(haystack)) {
      matched.push(re.source)
    }
  }
  if (matched.length > 0) {
    return { privacy_class: 3, matched_patterns: matched }
  }

  for (const re of CLASS_2_PATTERNS) {
    if (re.test(haystack)) {
      matched.push(re.source)
    }
  }
  if (matched.length > 0) {
    return { privacy_class: 2, matched_patterns: matched }
  }

  return { privacy_class: 1, matched_patterns: [] }
}
