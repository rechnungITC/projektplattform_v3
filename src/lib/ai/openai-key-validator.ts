/**
 * PROJ-32-b — OpenAI API key validator.
 *
 * Server-only. Single raw fetch GET /v1/models against api.openai.com
 * to validate an API key. Same pattern as Anthropic-validator (32a):
 * exactly one round-trip, no retry logic, clean status mapping.
 *
 * Status codes:
 *   * valid        — 200 OK
 *   * invalid      — 401/403, key rejected
 *   * rate_limited — 429
 *   * unknown      — timeout, 5xx, network error
 */

const OPENAI_BASE_URL = "https://api.openai.com"
const VALIDATION_TIMEOUT_MS = 5000

export type OpenAIValidationStatus =
  | "valid"
  | "invalid"
  | "rate_limited"
  | "unknown"

export interface OpenAIValidationResult {
  status: OpenAIValidationStatus
  http_status: number | null
  detail: string | null
}

export async function validateOpenAIKey(
  apiKey: string,
): Promise<OpenAIValidationResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS)

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/v1/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    })

    if (response.ok) {
      return { status: "valid", http_status: response.status, detail: null }
    }
    if (response.status === 401 || response.status === 403) {
      return {
        status: "invalid",
        http_status: response.status,
        detail: "OpenAI rejected the key (401/403).",
      }
    }
    if (response.status === 429) {
      return {
        status: "rate_limited",
        http_status: response.status,
        detail: "OpenAI rate limit hit during validation.",
      }
    }
    return {
      status: "unknown",
      http_status: response.status,
      detail: `Unexpected HTTP ${response.status} from OpenAI.`,
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        status: "unknown",
        http_status: null,
        detail: `OpenAI validation timed out after ${VALIDATION_TIMEOUT_MS}ms.`,
      }
    }
    return {
      status: "unknown",
      http_status: null,
      detail: err instanceof Error ? err.message : String(err),
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Build a non-personal display fingerprint from an OpenAI key like
 * "sk-proj-…XYZ" or "sk-…XYZ" → "sk-...XYZ" (last 4 chars).
 */
export function buildOpenAIFingerprint(apiKey: string): string {
  const trimmed = apiKey.trim()
  if (trimmed.length < 8) return "sk-...****"
  return `sk-...${trimmed.slice(-4)}`
}
