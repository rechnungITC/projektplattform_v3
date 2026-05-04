/**
 * PROJ-32a — Anthropic API key validator.
 *
 * Server-only. Performs a single raw fetch GET /v1/models against the
 * Anthropic API to validate an API key. Raw fetch (not the AI SDK) by
 * design — we want exactly one round-trip, no retry logic, and clean
 * status mapping.
 *
 * Returns one of four statuses:
 *   * valid         — 200 OK, key works
 *   * invalid       — 401/403, key rejected
 *   * rate_limited  — 429, can't validate right now
 *   * unknown       — timeout, 5xx, or network error — unable to validate
 */

const ANTHROPIC_BASE_URL = "https://api.anthropic.com"
const ANTHROPIC_API_VERSION = "2023-06-01"
const VALIDATION_TIMEOUT_MS = 5000

export type AnthropicValidationStatus =
  | "valid"
  | "invalid"
  | "rate_limited"
  | "unknown"

export interface AnthropicValidationResult {
  status: AnthropicValidationStatus
  /** HTTP status code if the request reached Anthropic, else null. */
  http_status: number | null
  /** Provider error message for debugging — never the key. */
  detail: string | null
}

export async function validateAnthropicKey(
  apiKey: string,
): Promise<AnthropicValidationResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS)

  try {
    const response = await fetch(`${ANTHROPIC_BASE_URL}/v1/models`, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
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
        detail: "Anthropic rejected the key (401/403).",
      }
    }
    if (response.status === 429) {
      return {
        status: "rate_limited",
        http_status: response.status,
        detail: "Anthropic rate limit hit during validation.",
      }
    }
    return {
      status: "unknown",
      http_status: response.status,
      detail: `Unexpected HTTP ${response.status} from Anthropic.`,
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        status: "unknown",
        http_status: null,
        detail: `Anthropic validation timed out after ${VALIDATION_TIMEOUT_MS}ms.`,
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
 * Build a non-personal display fingerprint from a key like
 * "sk-ant-api03-abc...XYZ" → "sk-ant-...XYZ" (last 4 chars).
 *
 * The fingerprint is what we surface in the UI and write into the
 * audit log. It MUST NOT be reversible to the full key — last-4-chars
 * is not personal data and is small enough to be useless on its own.
 */
export function buildAnthropicFingerprint(apiKey: string): string {
  const trimmed = apiKey.trim()
  if (trimmed.length < 8) {
    // Should not happen — schema enforces min length — but defensive.
    return "sk-ant-...****"
  }
  const tail = trimmed.slice(-4)
  return `sk-ant-...${tail}`
}
