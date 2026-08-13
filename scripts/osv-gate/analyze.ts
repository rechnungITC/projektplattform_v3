/**
 * PROJ-147 — severity gate over osv-scanner JSON output.
 *
 * osv-scanner has no severity threshold: `scan` exits 1 on ANY finding, Low and
 * Medium included. The house norm is HIGH and above (`npm audit --audit-level=high`,
 * the replaced Snyk call used `--severity-threshold=high`, and PROJ-140 explicitly
 * risk-accepted the remaining moderates). Enrolling a stricter gate would be a
 * policy change nobody approved, and it would block every PR on the first moderate
 * advisory in a dev dependency. So the threshold is drawn here instead.
 *
 * Two severity sources, because neither alone is complete:
 *   - `groups[].max_severity` — numeric CVSS as a string, present per group.
 *   - `vulnerabilities[].database_specific.severity` — GitHub's label, present for
 *     GHSA-sourced entries and sometimes filled in when the CVSS score is not.
 *
 * Findings with no severity in either place are neither failed nor swallowed: they
 * are returned as `unrated` so the caller can print them. Silently dropping them
 * would be the same "looks covered, isn't" defect this slice removes.
 */

export const CVSS_HIGH = 7.0

export interface OsvGroup {
  ids?: string[]
  max_severity?: string
}

export interface OsvVulnerability {
  id?: string
  database_specific?: { severity?: string }
}

export interface OsvPackage {
  package?: { name?: string; version?: string; ecosystem?: string }
  groups?: OsvGroup[]
  vulnerabilities?: OsvVulnerability[]
}

export interface OsvReport {
  results?: { source?: { path?: string }; packages?: OsvPackage[] }[]
}

export interface Finding {
  id: string
  packageName: string
  packageVersion: string
  cvss: number | null
  label: string | null
}

export interface GateResult {
  blocking: Finding[]
  belowThreshold: Finding[]
  unrated: Finding[]
  totalFindings: number
}

const HIGH_LABELS = new Set(["HIGH", "CRITICAL"])

function parseCvss(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * Classifies every finding in an osv-scanner JSON report.
 *
 * A finding blocks when its CVSS is >= 7.0 OR GitHub labels it HIGH/CRITICAL. The
 * label is a fallback, not a second opinion: an advisory can carry a label without
 * a score, and treating a scoreless HIGH as "below threshold" would be a fail-open.
 */
export function evaluate(report: OsvReport): GateResult {
  const blocking: Finding[] = []
  const belowThreshold: Finding[] = []
  const unrated: Finding[] = []

  for (const result of report.results ?? []) {
    for (const pkg of result.packages ?? []) {
      const name = pkg.package?.name ?? "(unknown)"
      const version = pkg.package?.version ?? "(unknown)"

      // Label lookup by advisory id, so a group can borrow the label of any of its ids.
      const labelById = new Map<string, string>()
      for (const vuln of pkg.vulnerabilities ?? []) {
        const label = vuln.database_specific?.severity?.toUpperCase()
        if (vuln.id !== undefined && label !== undefined) labelById.set(vuln.id, label)
      }

      for (const group of pkg.groups ?? []) {
        const ids = group.ids ?? []
        const id = ids[0] ?? "(unknown)"
        const cvss = parseCvss(group.max_severity)
        const label = ids.map((i) => labelById.get(i)).find((l) => l !== undefined) ?? null

        const finding: Finding = { id, packageName: name, packageVersion: version, cvss, label }

        if (cvss !== null && cvss >= CVSS_HIGH) blocking.push(finding)
        else if (label !== null && HIGH_LABELS.has(label)) blocking.push(finding)
        else if (cvss === null && label === null) unrated.push(finding)
        else belowThreshold.push(finding)
      }
    }
  }

  return {
    blocking,
    belowThreshold,
    unrated,
    totalFindings: blocking.length + belowThreshold.length + unrated.length,
  }
}

export function formatFinding(f: Finding): string {
  const sev = f.cvss !== null ? `CVSS ${f.cvss}` : f.label !== null ? f.label : "no severity"
  return `${f.id} — ${f.packageName}@${f.packageVersion} (${sev})`
}
