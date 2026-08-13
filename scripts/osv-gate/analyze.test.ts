import { describe, expect, it } from "vitest"

import { evaluate, formatFinding, type OsvReport } from "./analyze"

/**
 * The shapes below are trimmed copies of real osv-scanner v2.5.0 JSON output,
 * captured by scanning a lockfile pinned to lodash 4.17.15 (PROJ-147 negative
 * proof). Hand-invented shapes would prove nothing about the real tool.
 */
function report(packages: OsvReport["results"] extends (infer R)[] | undefined
  ? R extends { packages?: infer P }
    ? P
    : never
  : never): OsvReport {
  return { results: [{ source: { path: "package-lock.json" }, packages }] }
}

describe("osv-gate severity classification", () => {
  it("blocks on a CVSS score at or above 7.0", () => {
    const result = evaluate(
      report([
        {
          package: { name: "lodash", version: "4.17.15", ecosystem: "npm" },
          groups: [{ ids: ["GHSA-35jh-r3h4-6jhm"], max_severity: "8.1" }],
          vulnerabilities: [{ id: "GHSA-35jh-r3h4-6jhm" }],
        },
      ]),
    )
    expect(result.blocking).toHaveLength(1)
    expect(result.blocking[0]?.id).toBe("GHSA-35jh-r3h4-6jhm")
    expect(result.belowThreshold).toHaveLength(0)
  })

  it("does not block on a moderate finding — the house norm is HIGH and above", () => {
    const result = evaluate(
      report([
        {
          package: { name: "lodash", version: "4.17.15", ecosystem: "npm" },
          groups: [{ ids: ["GHSA-29mw-wpgm-hmr9"], max_severity: "5.3" }],
          vulnerabilities: [
            { id: "GHSA-29mw-wpgm-hmr9", database_specific: { severity: "MODERATE" } },
          ],
        },
      ]),
    )
    expect(result.blocking).toHaveLength(0)
    expect(result.belowThreshold).toHaveLength(1)
  })

  it("blocks a scoreless advisory that GitHub labels HIGH — a scoreless HIGH must not fail open", () => {
    const result = evaluate(
      report([
        {
          package: { name: "some-pkg", version: "1.0.0", ecosystem: "npm" },
          groups: [{ ids: ["GHSA-scoreless"], max_severity: "" }],
          vulnerabilities: [{ id: "GHSA-scoreless", database_specific: { severity: "HIGH" } }],
        },
      ]),
    )
    expect(result.blocking).toHaveLength(1)
    expect(result.blocking[0]?.cvss).toBeNull()
    expect(result.blocking[0]?.label).toBe("HIGH")
  })

  it("reports a finding with no severity anywhere as unrated instead of dropping it", () => {
    const result = evaluate(
      report([
        {
          package: { name: "mystery", version: "0.1.0", ecosystem: "npm" },
          groups: [{ ids: ["OSV-unrated"] }],
          vulnerabilities: [{ id: "OSV-unrated" }],
        },
      ]),
    )
    expect(result.blocking).toHaveLength(0)
    expect(result.belowThreshold).toHaveLength(0)
    expect(result.unrated).toHaveLength(1)
    expect(result.totalFindings).toBe(1)
  })

  it("borrows the label from any id in the group, not only the first", () => {
    const result = evaluate(
      report([
        {
          package: { name: "aliased", version: "2.0.0", ecosystem: "npm" },
          groups: [{ ids: ["GHSA-no-label", "GHSA-has-label"], max_severity: "" }],
          vulnerabilities: [
            { id: "GHSA-has-label", database_specific: { severity: "CRITICAL" } },
          ],
        },
      ]),
    )
    expect(result.blocking).toHaveLength(1)
    expect(result.blocking[0]?.label).toBe("CRITICAL")
  })

  it("treats an empty report as clean without inventing findings", () => {
    expect(evaluate({}).totalFindings).toBe(0)
    expect(evaluate({ results: [] }).totalFindings).toBe(0)
  })

  it("names the package and severity in the printed line", () => {
    expect(
      formatFinding({ id: "GHSA-x", packageName: "p", packageVersion: "1.2.3", cvss: 9.8, label: "CRITICAL" }),
    ).toBe("GHSA-x — p@1.2.3 (CVSS 9.8)")
    expect(
      formatFinding({ id: "GHSA-y", packageName: "q", packageVersion: "0.1.0", cvss: null, label: null }),
    ).toBe("GHSA-y — q@0.1.0 (no severity)")
  })
})
