import { describe, expect, it } from "vitest"

import { classifyAttempt, formatCounts } from "./analyze"

const report = (vulnerabilities: Record<string, number>) =>
  JSON.stringify({ metadata: { vulnerabilities } })

describe("classifyAttempt", () => {
  it("passes a tree with nothing at HIGH or above", () => {
    const result = classifyAttempt({
      stdout: report({ info: 0, low: 1, moderate: 2, high: 0, critical: 0, total: 3 }),
      stderr: "",
      exitCode: 0,
    })
    expect(result.kind).toBe("clean")
  })

  it("fails on HIGH and reports how many", () => {
    const result = classifyAttempt({
      stdout: report({ low: 0, moderate: 1, high: 2, critical: 1, total: 4 }),
      stderr: "",
      exitCode: 1,
    })
    expect(result).toMatchObject({ kind: "findings", blocking: 3 })
  })

  // The whole point of the slice: the verdict comes from the report, never from
  // the exit code — which npm sets to 1 for BOTH "advisory found" and "endpoint
  // down". These two cases share an exit code and must not share a verdict.
  it("does not let the exit code decide — a clean report with exit 1 is still clean", () => {
    const result = classifyAttempt({
      stdout: report({ low: 3, high: 0, critical: 0, total: 3 }),
      stderr: "",
      exitCode: 1,
    })
    expect(result.kind).toBe("clean")
  })

  it("does not let the exit code decide — findings with exit 0 are still findings", () => {
    const result = classifyAttempt({
      stdout: report({ high: 1, total: 1 }),
      stderr: "",
      exitCode: 0,
    })
    expect(result.kind).toBe("findings")
  })

  // Pinned verbatim from the run that motivated this slice (job 33858605152,
  // 2026-09-04 09:35:03Z), so a future npm wording change shows up as a red test
  // rather than as a silent reclassification.
  it("recognises the measured CI outage output", () => {
    const result = classifyAttempt({
      stdout: "",
      stderr: [
        "npm warn audit network timeout at: https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
        "undefined",
        "npm error audit endpoint returned an error",
      ].join("\n"),
      exitCode: 1,
    })
    expect(result).toMatchObject({ kind: "endpoint_error" })
  })

  it("recognises the 503 shape seen on PR #544", () => {
    const result = classifyAttempt({
      stdout: "",
      stderr:
        "npm warn audit 503 Service Unavailable - POST https://registry.npmjs.org/-/npm/v1/security/advisories/bulk - Service Unavailable",
      exitCode: 1,
    })
    expect(result).toMatchObject({ kind: "endpoint_error" })
  })

  // A transient retry warning must not mask a delivered answer: npm can warn and
  // still produce a complete report. If this regressed, a real HIGH advisory would
  // be reported as an outage and waved through by the fallback.
  it("prefers a usable report over a stale warning signature", () => {
    const result = classifyAttempt({
      stdout: report({ high: 1, total: 1 }),
      stderr: "npm warn audit network timeout at: https://registry.npmjs.org/…",
      exitCode: 1,
    })
    expect(result).toMatchObject({ kind: "findings", blocking: 1 })
  })

  // The verbatim shape npm emits on a dead endpoint, captured 2026-09-04 11:42Z
  // from the live outage: a JSON body that parses but carries `error` and NO
  // `metadata.vulnerabilities`. Without the `usable` check this would be the worst
  // possible outcome — an outage read as a clean bill of health.
  it("recognises npm's real --json failure body", () => {
    const result = classifyAttempt({
      stdout: JSON.stringify({
        message: "network timeout at: https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
        error: { summary: "", detail: "" },
      }),
      stderr: [
        "npm warn audit network timeout at: https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
        "npm error audit endpoint returned an error",
      ].join("\n"),
      exitCode: 1,
    })
    expect(result).toMatchObject({ kind: "endpoint_error" })
  })

  it("fails closed on unparseable output with no known signature", () => {
    const result = classifyAttempt({ stdout: "<html>502</html>", stderr: "", exitCode: 1 })
    expect(result.kind).toBe("unclassifiable")
  })

  it("fails closed on a report without vulnerability counts", () => {
    const result = classifyAttempt({ stdout: JSON.stringify({ metadata: {} }), stderr: "", exitCode: 1 })
    expect(result.kind).toBe("unclassifiable")
  })

  it("treats an error-shaped report with a signature as an outage, not a verdict", () => {
    const result = classifyAttempt({
      stdout: JSON.stringify({ error: { code: "ETIMEDOUT" } }),
      stderr: "npm error audit endpoint returned an error",
      exitCode: 1,
    })
    expect(result).toMatchObject({ kind: "endpoint_error" })
  })
})

describe("formatCounts", () => {
  it("names what was found and drops the total", () => {
    expect(formatCounts({ low: 2, high: 1, total: 3 })).toBe("2 low, 1 high")
  })

  it("says none rather than printing an empty string", () => {
    expect(formatCounts({ low: 0, total: 0 })).toBe("none")
  })
})
