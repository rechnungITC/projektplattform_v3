/**
 * PROJ-Y-173a — CLI wrapper around the npm-audit classification.
 *
 * Usage: tsx scripts/npm-audit-gate/index.ts
 *
 * Exit codes, and they are the whole point:
 *   0 — audit ran and found nothing at HIGH or above.
 *   1 — audit ran and found something at HIGH or above, OR the outcome could not
 *       be classified. Fail-closed: an unreadable answer is not a clean bill.
 *   2 — npm's advisory endpoint was unreachable across every attempt. NOT a
 *       security verdict; the caller must obtain coverage elsewhere (the workflow
 *       falls back to the OSV scanner) and must say so loudly.
 *
 * The threshold lives in `analyze.ts`, not in an `--audit-level` flag, for the same
 * reason as `scripts/osv-gate`: the verdict is derived from the report, never from
 * npm's exit code — which is 1 for both "advisory found" and "endpoint down".
 */

import { spawnSync } from "node:child_process"

import { classifyAttempt, formatCounts, type Classification } from "./analyze"

const ATTEMPTS = 3
const FETCH_TIMEOUT_MS = 60_000
const BACKOFF_MS = [5_000, 15_000]

function sleep(ms: number): void {
  // Synchronous on purpose: this is a CI gate, not a server, and a blocking wait
  // keeps the control flow readable.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function runAudit(): Classification {
  const result = spawnSync(
    "npm",
    [
      "audit",
      "--omit=dev",
      "--json",
      `--fetch-timeout=${FETCH_TIMEOUT_MS}`,
      "--no-fund",
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  )

  if (result.error !== undefined) {
    return {
      kind: "unclassifiable",
      reason: `could not run npm: ${result.error.message}`,
    }
  }

  return classifyAttempt({
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? -1,
  })
}

let last: Classification = {
  kind: "unclassifiable",
  reason: "no attempt was made",
}

for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  last = runAudit()

  if (last.kind !== "endpoint_error") break

  console.log(
    `npm-audit-gate: attempt ${attempt}/${ATTEMPTS} could not reach npm's advisory endpoint (${last.signature}).`,
  )

  const backoff = BACKOFF_MS[attempt - 1]
  if (attempt < ATTEMPTS && backoff !== undefined) {
    console.log(`npm-audit-gate: retrying in ${backoff / 1000}s.`)
    sleep(backoff)
  }
}

switch (last.kind) {
  case "clean":
    console.log(
      `npm-audit-gate: OK — production tree audited, nothing at HIGH or above (${formatCounts(last.counts)}).`,
    )
    process.exit(0)

  case "findings":
    console.log(`npm-audit-gate: production advisories — ${formatCounts(last.counts)}.`)
    console.error(
      `::error::npm-audit-gate: ${last.blocking} advisory/advisories at HIGH or above in the production dependency tree. Fix them in their own slice (PROJ-140/142/149/160/170/172 pattern: targeted overrides or in-range bumps), never via 'npm audit fix --force'.`,
    )
    process.exit(1)

  case "endpoint_error":
    console.log(
      `npm-audit-gate: npm's advisory endpoint stayed unreachable across ${ATTEMPTS} attempts (${last.signature}).`,
    )
    console.log(
      "npm-audit-gate: this is NOT a clean bill of health — it is an unanswered question. The caller must obtain coverage from the second source.",
    )
    process.exit(2)

  case "unclassifiable":
    console.error(
      `::error::npm-audit-gate: could not classify the audit outcome — ${last.reason}. Failing closed: an unreadable answer is not a clean bill of health.`,
    )
    process.exit(1)
}
