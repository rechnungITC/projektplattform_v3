/**
 * PROJ-135 — persistence helpers for dialogic wizard clarifying Q&A.
 *
 * On finalize, the answered clarifying questions are appended to the kickoff
 * `context_sources.content_excerpt` (Option B-modified, CIA-reviewed): the
 * excerpt is the field the PROJ-70/88/89 collectors AND the Class-3 classifier
 * actually read, so the Q&A must live there (not in `source_metadata`-only,
 * which is invisible to both). The full Q&A is mirrored to `source_metadata`
 * for audit by the caller.
 *
 * Extracted from the finalize route so the 8000-char truncation rule (CIA
 * Auflage 5) is unit-testable in isolation.
 */

/** PROJ-44-β content_excerpt cap. The Q&A append must always fit. */
export const CONTENT_EXCERPT_MAX = 8000
const QA_DELIMITER = "\n\n--- Rückfragen & Antworten (Wizard) ---\n"
const TRUNC_MARKER = "\n[…Excerpt gekürzt…]"

export interface ClarifyingAnswerInput {
  question: string
  answer: string
  gap_tag?: string | null
}

/**
 * Extract answered (non-empty) clarifying Q&A from a wizard draft payload.
 * Skipped/empty questions are dropped (AC-135.4: omitted from the addendum).
 */
export function readClarifyingAnswers(
  data: Record<string, unknown>,
): ClarifyingAnswerInput[] {
  const block = (data.clarifying ?? null) as { answers?: unknown } | null
  if (!block || !Array.isArray(block.answers)) return []
  return (block.answers as unknown[])
    .map((a) => {
      const row = (a ?? {}) as Record<string, unknown>
      const question = typeof row.question === "string" ? row.question.trim() : ""
      const answer = typeof row.answer === "string" ? row.answer.trim() : ""
      const gap_tag = typeof row.gap_tag === "string" ? row.gap_tag : null
      return { question, answer, gap_tag }
    })
    .filter((a) => a.question.length > 0 && a.answer.length > 0)
}

/** Render the answered Q&A as a stable, plain-text block. */
export function renderQaBlock(answers: ClarifyingAnswerInput[]): string {
  return answers
    .map((a, i) => {
      const tag = a.gap_tag ? ` [${a.gap_tag}]` : ""
      return `F${i + 1}${tag}: ${a.question}\nA${i + 1}: ${a.answer}`
    })
    .join("\n\n")
}

/**
 * Append the Q&A block to the excerpt within the 8000-char cap (AC-135.4 /
 * CIA Auflage 5): the Q&A block is ALWAYS kept in full (high-value
 * clarification); the original excerpt is head-truncated if needed (it is
 * redundant with the stored kickoff file). Guarantees `result.length <=
 * CONTENT_EXCERPT_MAX`.
 */
export function appendWithinCap(excerpt: string, qaBlock: string): string {
  const suffix = QA_DELIMITER + qaBlock
  if (suffix.length >= CONTENT_EXCERPT_MAX) {
    // Pathological: the Q&A alone exceeds the cap — keep only its tail.
    return suffix.slice(suffix.length - CONTENT_EXCERPT_MAX)
  }
  const budget = CONTENT_EXCERPT_MAX - suffix.length
  if (excerpt.length <= budget) return excerpt + suffix
  const keep = Math.max(0, budget - TRUNC_MARKER.length)
  return excerpt.slice(0, keep) + TRUNC_MARKER + suffix
}
