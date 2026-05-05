/**
 * PROJ-32-b — Google AI Studio (Gemini) API key validator.
 *
 * Server-only. Single raw fetch GET /v1beta/models?key=<key> against
 * generativelanguage.googleapis.com to validate a Gemini API key.
 *
 * Note: Gemini's Studio API uses a query-string `key=` parameter (or
 * `x-goog-api-key` header) — NOT Bearer auth. We use the header form
 * to avoid leaking the key into URL-shaped logs.
 *
 * Status codes:
 *   * valid        — 200 OK
 *   * invalid      — 400 (Google often returns 400 for bad keys, 403
 *                    for policy issues), 401, 403
 *   * rate_limited — 429
 *   * unknown      — timeout, 5xx, network error
 */

const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com"
const VALIDATION_TIMEOUT_MS = 5000

export type GoogleValidationStatus =
  | "valid"
  | "invalid"
  | "rate_limited"
  | "unknown"

export interface GoogleValidationResult {
  status: GoogleValidationStatus
  http_status: number | null
  detail: string | null
}

export async function validateGoogleKey(
  apiKey: string,
): Promise<GoogleValidationResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS)

  try {
    const response = await fetch(`${GOOGLE_BASE_URL}/v1beta/models`, {
      method: "GET",
      headers: {
        "x-goog-api-key": apiKey,
      },
      signal: controller.signal,
    })

    if (response.ok) {
      return { status: "valid", http_status: response.status, detail: null }
    }
    // Google sometimes returns 400 for invalid keys (with body
    // "API key not valid") — treat 400/401/403 all as invalid.
    if (
      response.status === 400 ||
      response.status === 401 ||
      response.status === 403
    ) {
      return {
        status: "invalid",
        http_status: response.status,
        detail: "Google rejected the key.",
      }
    }
    if (response.status === 429) {
      return {
        status: "rate_limited",
        http_status: response.status,
        detail: "Google rate limit hit during validation.",
      }
    }
    return {
      status: "unknown",
      http_status: response.status,
      detail: `Unexpected HTTP ${response.status} from Google.`,
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        status: "unknown",
        http_status: null,
        detail: `Google validation timed out after ${VALIDATION_TIMEOUT_MS}ms.`,
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
 * Build a non-personal display fingerprint from a Google API key.
 * Gemini API keys typically start with "AIza" + 35 chars.
 */
export function buildGoogleFingerprint(apiKey: string): string {
  const trimmed = apiKey.trim()
  if (trimmed.length < 8) return "AIza...****"
  return `AIza...${trimmed.slice(-4)}`
}
