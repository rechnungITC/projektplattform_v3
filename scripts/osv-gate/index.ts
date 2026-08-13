/**
 * PROJ-147 — CLI wrapper around the OSV severity gate.
 *
 * Usage: tsx scripts/osv-gate/index.ts <osv-scanner-json-file>
 *
 * Exit 1 only when a finding is HIGH or above. Findings below the threshold and
 * findings without any severity are printed, never hidden — see analyze.ts for why.
 */

import { readFileSync } from "node:fs"

import { evaluate, formatFinding, type OsvReport } from "./analyze"

const path = process.argv[2]
if (path === undefined) {
  console.error("osv-gate: expected a path to osv-scanner JSON output")
  process.exit(2)
}

let report: OsvReport
try {
  report = JSON.parse(readFileSync(path, "utf8")) as OsvReport
} catch (error) {
  // A malformed or missing report must not read as "nothing found".
  console.error(`osv-gate: cannot read ${path} — ${(error as Error).message}`)
  process.exit(2)
}

const { blocking, belowThreshold, unrated, totalFindings } = evaluate(report)

if (unrated.length > 0) {
  console.log(`osv-gate: ${unrated.length} finding(s) carry no severity at all:`)
  for (const f of unrated) console.log(`  ? ${formatFinding(f)}`)
  console.log("::warning::osv-gate: findings without any severity rating — reported, not blocking. Judge them by hand.")
}

if (belowThreshold.length > 0) {
  console.log(`osv-gate: ${belowThreshold.length} finding(s) below the HIGH threshold (informational):`)
  for (const f of belowThreshold) console.log(`  · ${formatFinding(f)}`)
}

if (blocking.length > 0) {
  console.log(`osv-gate: ${blocking.length} finding(s) at HIGH or above:`)
  for (const f of blocking) console.log(`  ✗ ${formatFinding(f)}`)
  console.error(
    `::error::osv-gate: ${blocking.length} HIGH+ advisory/advisories in the dependency lockfile. Fix them in their own slice (PROJ-140/142 pattern: targeted overrides or in-range bumps), never via 'npm audit fix --force'.`,
  )
  process.exit(1)
}

console.log(
  `osv-gate: OK — ${totalFindings} finding(s) total, none at HIGH or above (threshold CVSS >= 7.0 or GitHub label HIGH/CRITICAL).`,
)
