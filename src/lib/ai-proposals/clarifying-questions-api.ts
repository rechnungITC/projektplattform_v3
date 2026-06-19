/**
 * PROJ-135 — client for the dialogic wizard clarifying-questions endpoint.
 *
 * The call is BOUNDED (~20s) via an AbortController so the wizard step never
 * hangs (AC-135.10). On timeout/error the caller treats it as a fail-open
 * "no questions" outcome — the step is always skippable and never blocks
 * finalize (AC-135.7).
 */

interface ApiErrorBody {
  error?: { message?: string }
}

/** ~20s bounded wait (AC-135.10), analog PROJ-70-γ parse timeout. */
const CLARIFYING_TIMEOUT_MS = 20_000

export interface ClarifyingQuestionDTO {
  question: string
  rationale: string | null
  gap_tag: string | null
}

export interface ClarifyingQuestionsResult {
  run_id: string | null
  questions: ClarifyingQuestionDTO[]
  external_blocked: boolean
  status?: string
  skipped_reason?: string
  error_message?: string
}

async function safeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody
    return body.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

/**
 * Trigger a clarifying-questions generation for a wizard draft. Resolves with
 * the run result (possibly an empty / blocked list). Rejects only on a
 * transport/HTTP error or the bounded-wait timeout — callers fail open.
 */
export async function generateClarifyingQuestions(
  draftId: string,
  count = 5,
): Promise<ClarifyingQuestionsResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CLARIFYING_TIMEOUT_MS)
  try {
    const response = await fetch(
      `/api/wizard-drafts/${encodeURIComponent(draftId)}/clarifying-questions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count }),
        cache: "no-store",
        signal: controller.signal,
      },
    )
    if (!response.ok) throw new Error(await safeError(response))
    return (await response.json()) as ClarifyingQuestionsResult
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        "Zeitüberschreitung bei der KI-Analyse (~20s) — du kannst den Schritt überspringen oder erneut versuchen.",
      )
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
