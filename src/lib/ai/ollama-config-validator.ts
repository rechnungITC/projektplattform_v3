/**
 * PROJ-32-c-β — Ollama config validator.
 *
 * Server-only. Validates a tenant-supplied Ollama config:
 *   1. Sanitizes the endpoint URL (HTTPS preferred; HTTP allowed with
 *      warning; SSRF-blocked schemes / hosts rejected).
 *   2. Performs a single GET `<baseURL>/api/tags` (5s timeout) to verify
 *      the endpoint is reachable AND the requested model is loaded.
 *
 * Returns one of six statuses:
 *   * valid          — 200 OK + model is in the /api/tags response
 *   * invalid        — Bearer-token rejected (401/403)
 *   * model_missing  — endpoint OK but the model is not pulled locally
 *   * rate_limited   — 429
 *   * unreachable    — timeout / DNS failure / connection refused
 *   * unknown        — unexpected status / parse error
 *
 * SSRF defense (CIA HIGH risk mitigation):
 *   - Scheme must be http or https.
 *   - Cloud-metadata IPs (169.254.0.0/16) are blocked.
 *   - .local / localhost loopback is blocked unless explicitly allowed
 *     (we do allow it because tenants legitimately run Ollama on the
 *     same host as a reverse proxy in dev / staging tunnels).
 *   - We do NOT follow redirects (`fetch` default with no manual follow).
 */

const VALIDATION_TIMEOUT_MS = 5000

export type OllamaValidationStatus =
  | "valid"
  | "invalid"
  | "rate_limited"
  | "unreachable"
  | "model_missing"
  | "unknown"

export interface OllamaValidationResult {
  status: OllamaValidationStatus
  /** HTTP status if the request reached the server. */
  http_status: number | null
  /** Provider-side error description, never any auth header. */
  detail: string | null
}

export interface OllamaValidationInput {
  endpointUrl: string
  modelId: string
  bearerToken?: string | null
}

export interface UrlSanitizationResult {
  ok: true
  /** URL with trailing slash stripped. */
  normalized: string
  /** True when scheme is http (warn the user). */
  insecure: boolean
}

export interface UrlRejectionResult {
  ok: false
  reason: string
}

/**
 * Validate + normalize an Ollama endpoint URL. Performed before any
 * network call. Returns either a normalized URL or a rejection reason.
 *
 * Public so the API route can run the same checks before persisting,
 * and so unit tests can pin down the rejection rules.
 */
export function sanitizeOllamaUrl(
  raw: string,
): UrlSanitizationResult | UrlRejectionResult {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return { ok: false, reason: "URL is empty." }
  }
  if (trimmed.length > 500) {
    return { ok: false, reason: "URL exceeds 500 characters." }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { ok: false, reason: "Not a valid URL." }
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      reason: `Unsupported scheme '${parsed.protocol}'. Only http and https are allowed.`,
    }
  }

  // SSRF: block cloud-metadata range. We do NOT block private RFC1918
  // ranges because tenants legitimately run Ollama on internal IPs
  // accessed through Cloudflare Tunnels / similar.
  const host = parsed.hostname.toLowerCase()
  if (
    host === "169.254.169.254" ||
    host.startsWith("169.254.") /* link-local + AWS / GCP / Azure metadata */
  ) {
    return {
      ok: false,
      reason: "Endpoint host targets cloud-metadata range (169.254.x.x) — blocked for security.",
    }
  }

  // Strip trailing slashes for canonical storage.
  const normalized = trimmed.replace(/\/+$/, "")

  return {
    ok: true,
    normalized,
    insecure: parsed.protocol === "http:",
  }
}

/**
 * Run the live test-call against the Ollama endpoint.
 *
 * Caller has already sanitized the URL. This function performs:
 *   1. GET /api/tags with optional Bearer header, 5s timeout
 *   2. Maps HTTP / parse / network outcome to one of the 6 statuses
 *   3. Looks up `modelId` in the JSON response (`models[].name` array
 *      from Ollama's native /api/tags endpoint)
 */
export async function validateOllamaConfig(
  input: OllamaValidationInput,
): Promise<OllamaValidationResult> {
  const url = `${input.endpointUrl.replace(/\/+$/, "")}/api/tags`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS)

  const headers: Record<string, string> = { accept: "application/json" }
  if (input.bearerToken) {
    headers.authorization = `Bearer ${input.bearerToken}`
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
      redirect: "manual",
    })

    if (response.status === 401 || response.status === 403) {
      return {
        status: "invalid",
        http_status: response.status,
        detail: "Endpoint rejected the bearer token (401/403).",
      }
    }
    if (response.status === 429) {
      return {
        status: "rate_limited",
        http_status: response.status,
        detail: "Endpoint returned 429 — rate limited.",
      }
    }
    if (!response.ok) {
      return {
        status: "unknown",
        http_status: response.status,
        detail: `Unexpected HTTP ${response.status} from Ollama.`,
      }
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      return {
        status: "unknown",
        http_status: response.status,
        detail: "Endpoint did not return valid JSON for /api/tags.",
      }
    }

    // Ollama /api/tags returns { models: [{ name: "llama3.1:70b", ... }, ...] }
    const models = (body as { models?: Array<{ name?: string }> } | null)
      ?.models
    if (!Array.isArray(models)) {
      return {
        status: "unknown",
        http_status: response.status,
        detail:
          "Endpoint /api/tags response shape unexpected — missing 'models' array.",
      }
    }

    const modelMatch = models.some(
      (m) => typeof m?.name === "string" && m.name === input.modelId,
    )
    if (!modelMatch) {
      return {
        status: "model_missing",
        http_status: response.status,
        detail: `Model '${input.modelId}' is not available on the server. Run 'ollama pull ${input.modelId}' on the Ollama host.`,
      }
    }

    return {
      status: "valid",
      http_status: response.status,
      detail: null,
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        status: "unreachable",
        http_status: null,
        detail: `Ollama validation timed out after ${VALIDATION_TIMEOUT_MS}ms.`,
      }
    }
    // Map fetch-level errors (DNS, connection refused, TLS) to unreachable.
    return {
      status: "unreachable",
      http_status: null,
      detail: err instanceof Error ? err.message : String(err),
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Build a non-personal display fingerprint for an Ollama endpoint, e.g.
 *   "https://ollama.acme.com" → "ollama.acme.com"
 *   "http://10.0.0.5:11434"   → "10.0.0.5:11434"
 *
 * Used in the audit log + UI display.
 */
export function buildOllamaFingerprint(
  endpointUrl: string,
  modelId: string,
): string {
  try {
    const parsed = new URL(endpointUrl)
    const host = parsed.host || endpointUrl
    return `ollama:${host}/${modelId}`
  } catch {
    return `ollama:${modelId}`
  }
}
