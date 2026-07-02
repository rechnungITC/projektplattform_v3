/**
 * PROJ-92 — Azure OpenAI config validator.
 *
 * Server-only. One round-trip minimal chat-completion against the tenant's
 * own Azure deployment. Unlike the OpenAI/Anthropic validators (which only
 * check a key against a shared host), Azure config has four moving parts
 * (endpoint, deployment, api-version, key) — a single deployment call
 * exercises all of them and produces an actionable status:
 *
 *   valid          — 200 OK (endpoint + deployment + api-version + key all good)
 *   invalid        — 401/403 (key rejected) or 400 (bad/deprecated api-version)
 *   model_missing  — 404 (deployment name does not exist on this resource)
 *   rate_limited   — 429
 *   unreachable    — network error / DNS / timeout (endpoint host wrong)
 *   unknown        — 5xx or any other unexpected status
 *
 * No silent stub fallback: a bad config surfaces a real status + detail so the
 * admin form can show an actionable message (AC-92.6).
 */

const VALIDATION_TIMEOUT_MS = 6000

export type AzureValidationStatus =
  | "valid"
  | "invalid"
  | "rate_limited"
  | "unreachable"
  | "model_missing"
  | "unknown"

export interface AzureValidationResult {
  status: AzureValidationStatus
  http_status: number | null
  detail: string | null
}

export interface AzureValidationInput {
  endpoint: string
  deployment: string
  apiKey: string
  apiVersion: string
}

/**
 * Normalize + sanity-check an Azure OpenAI endpoint URL. Requires https and a
 * host; strips a trailing slash. Returns the normalized origin (no path).
 */
export function sanitizeAzureEndpoint(
  raw: string,
): { ok: true; normalized: string } | { ok: false; reason: string } {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return { ok: false, reason: "endpoint must be a valid URL." }
  }
  if (url.protocol !== "https:") {
    return { ok: false, reason: "endpoint must use https." }
  }
  if (!url.hostname) {
    return { ok: false, reason: "endpoint is missing a host." }
  }
  // Keep only scheme + host (+ non-default port); drop any path/query.
  const normalized = `https://${url.host}`
  return { ok: true, normalized }
}

/** Build the Azure chat-completions URL for a deployment. */
export function buildAzureChatUrl(
  endpoint: string,
  deployment: string,
  apiVersion: string,
): string {
  const base = endpoint.replace(/\/+$/, "")
  const dep = encodeURIComponent(deployment)
  return `${base}/openai/deployments/${dep}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`
}

export async function validateAzureConfig(
  input: AzureValidationInput,
): Promise<AzureValidationResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS)

  try {
    const response = await fetch(
      buildAzureChatUrl(input.endpoint, input.deployment, input.apiVersion),
      {
        method: "POST",
        headers: {
          "api-key": input.apiKey,
          "content-type": "application/json",
        },
        // Minimal probe: one token, deterministic. Azure charges ~1 token.
        body: JSON.stringify({
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
          temperature: 0,
        }),
        signal: controller.signal,
      },
    )

    if (response.ok) {
      return { status: "valid", http_status: response.status, detail: null }
    }
    if (response.status === 401 || response.status === 403) {
      return {
        status: "invalid",
        http_status: response.status,
        detail: "Azure rejected the api-key (401/403).",
      }
    }
    if (response.status === 404) {
      return {
        status: "model_missing",
        http_status: response.status,
        detail:
          "Deployment not found (404) — check the deployment name on this Azure resource.",
      }
    }
    if (response.status === 400) {
      // Most commonly a bad/deprecated api-version.
      const body = await safeReadText(response)
      const hint = /api-version|apiversion/i.test(body)
        ? "Likely an invalid or deprecated api-version."
        : "Azure rejected the request (400)."
      return { status: "invalid", http_status: 400, detail: hint }
    }
    if (response.status === 429) {
      return {
        status: "rate_limited",
        http_status: 429,
        detail: "Azure rate limit hit during validation.",
      }
    }
    return {
      status: "unknown",
      http_status: response.status,
      detail: `Unexpected HTTP ${response.status} from Azure.`,
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        status: "unreachable",
        http_status: null,
        detail: `Azure validation timed out after ${VALIDATION_TIMEOUT_MS}ms.`,
      }
    }
    return {
      status: "unreachable",
      http_status: null,
      detail: err instanceof Error ? err.message : String(err),
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ""
  }
}

/**
 * Non-personal display fingerprint for an Azure config. Uses the resource host
 * + deployment (never the key material), e.g.
 * "my-res.openai.azure.com/gpt-4o".
 */
export function buildAzureFingerprint(
  endpoint: string,
  deployment: string,
): string {
  let host = endpoint
  try {
    host = new URL(endpoint).host
  } catch {
    /* keep raw */
  }
  return `${host}/${deployment}`
}
