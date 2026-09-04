/**
 * PROJ-Y-173a — classify one `npm audit` attempt from its REPORT, not its exit code.
 *
 * The defect this closes: `npm audit` exits 1 both when it finds an advisory and
 * when it cannot reach npm's advisory endpoint. Measured on 2026-09-04, while the
 * registry itself answered `HTTP 200 in 0.07s`:
 *
 *   npm warn audit network timeout at: .../-/npm/v1/security/advisories/bulk
 *   npm error audit endpoint returned an error
 *   ##[error]Process completed with exit code 1.
 *
 * A required security check that reads an outage as "security problem" teaches
 * people to click red security gates away — the same damage PROJ-147 removed from
 * the other direction, where a gate looked green and checked nothing.
 *
 * Design rule, taken from `scripts/osv-gate`: a malformed or missing report must
 * never read as "nothing found". Anything this module cannot classify is returned
 * as `unclassifiable`, and the caller fails on it. Fail-closed is the only safe
 * default for a security gate.
 */

/** npm's own severity buckets, ordered. The house threshold is `high` and above. */
export const BLOCKING_SEVERITIES = ["high", "critical"] as const

/**
 * Signatures npm emits when the advisory endpoint is unreachable. Matched against
 * stdout+stderr, case-insensitively. Deliberately narrow: a broad "network" match
 * would swallow genuine failures, which is the one direction that must not happen.
 */
const ENDPOINT_ERROR_SIGNATURES = [
  "audit endpoint returned an error",
  "network timeout at:",
  "service unavailable",
  "econnreset",
  "enotfound",
  "etimedout",
  "socket hang up",
] as const

export interface NpmAuditMetadata {
  vulnerabilities?: Partial<Record<string, number>>
}

export interface NpmAuditReport {
  metadata?: NpmAuditMetadata
  error?: unknown
}

export type Classification =
  | { kind: "clean"; counts: Record<string, number> }
  | { kind: "findings"; counts: Record<string, number>; blocking: number }
  | { kind: "endpoint_error"; signature: string }
  | { kind: "unclassifiable"; reason: string }

export interface Attempt {
  /** Raw stdout of `npm audit --json`. */
  stdout: string
  /** Raw stderr — npm writes its warnings and errors here. */
  stderr: string
  /** Process exit code; used only as a cross-check, never as the verdict. */
  exitCode: number
}

function findEndpointSignature(text: string): string | null {
  const haystack = text.toLowerCase()
  for (const signature of ENDPOINT_ERROR_SIGNATURES) {
    if (haystack.includes(signature)) return signature
  }
  return null
}

/**
 * Classify one attempt. The order matters: an endpoint error is decided from the
 * emitted signature BEFORE the report is parsed, because npm prints a partial or
 * absent report in exactly that case.
 */
export function classifyAttempt(attempt: Attempt): Classification {
  const signature = findEndpointSignature(`${attempt.stdout}\n${attempt.stderr}`)

  let report: NpmAuditReport | null = null
  try {
    report = JSON.parse(attempt.stdout) as NpmAuditReport
  } catch {
    report = null
  }

  // A parsed report with real counts wins over a signature: npm can warn about a
  // transient retry and still deliver a complete answer. Only when there is no
  // usable report does the signature decide.
  const counts = report?.metadata?.vulnerabilities
  const usable =
    report !== null && counts !== undefined && report.error === undefined

  if (!usable) {
    if (signature !== null) return { kind: "endpoint_error", signature }
    return {
      kind: "unclassifiable",
      reason:
        report === null
          ? "npm audit produced no parseable JSON report and no known endpoint-error signature"
          : "npm audit report carries no metadata.vulnerabilities and no known endpoint-error signature",
    }
  }

  const normalised: Record<string, number> = {}
  for (const [severity, amount] of Object.entries(counts)) {
    if (typeof amount === "number") normalised[severity] = amount
  }

  const blocking = BLOCKING_SEVERITIES.reduce(
    (sum, severity) => sum + (normalised[severity] ?? 0),
    0,
  )

  return blocking > 0
    ? { kind: "findings", counts: normalised, blocking }
    : { kind: "clean", counts: normalised }
}

export function formatCounts(counts: Record<string, number>): string {
  const parts = Object.entries(counts)
    .filter(([severity, amount]) => amount > 0 && severity !== "total")
    .map(([severity, amount]) => `${amount} ${severity}`)
  return parts.length > 0 ? parts.join(", ") : "none"
}
