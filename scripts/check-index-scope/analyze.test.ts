import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { analyzeIndex, EXPECTED_HEADER, SCOPE_UNCLASSIFIED } from "./analyze"

const SEP = "|----|---------|--------|------------------|------|---------|"

function table(...rows: string[]): string {
  return [EXPECTED_HEADER, SEP, ...rows].join("\n")
}

/** `| ID | Feature | Status | Scope | Spec | Created |` */
function row(id: string, status: string, scope: string, feature = "Some feature"): string {
  return `| ${id} | ${feature} | ${status} | ${scope} | [Spec](${id}-x.md) | 2026-01-01 |`
}

describe("analyzeIndex", () => {
  it("accepts a well-formed table", () => {
    const { errors, warnings } = analyzeIndex(
      table(
        row("PROJ-1", "Deployed", "full"),
        row("PROJ-2", "Deployed", "mvp"),
        row("PROJ-3", "Deployed", "alpha"),
        row("PROJ-4", "Deployed", "tooling-only"),
        row("PROJ-5", "Planned", "—"),
        row("PROJ-6", "Superseded", "superseded")
      )
    )
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  })

  it("fails when the header lacks the separate Deployment Scope column", () => {
    const content = [
      "| ID | Feature | Status | Spec | Created |",
      "|----|---------|--------|------|---------|",
      "| PROJ-1 | F | Deployed | full | [Spec](x.md) | 2026-01-01 |",
    ].join("\n")
    const { errors } = analyzeIndex(content)
    expect(errors.some((e) => e.includes("Deployment Scope column"))).toBe(true)
  })

  it("rejects a Deployed row with an empty scope", () => {
    const { errors } = analyzeIndex(table(row("PROJ-1", "Deployed", "—")))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/Deployed requires one of/)
  })

  it("rejects a pre-deployment row carrying a real scope", () => {
    const { errors } = analyzeIndex(table(row("PROJ-1", "Planned", "full")))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/pre-deployment/)
  })

  it("rejects Deployed + superseded in both directions", () => {
    expect(analyzeIndex(table(row("PROJ-1", "Deployed", "superseded"))).errors).toHaveLength(1)
    expect(analyzeIndex(table(row("PROJ-2", "Superseded", "full"))).errors).toHaveLength(1)
  })

  it("rejects an unknown scope value", () => {
    const { errors } = analyzeIndex(table(row("PROJ-1", "Deployed", "partial")))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/is not a deployment scope/)
  })

  it("treats the transitional marker on a Deployed row as counted debt, not an error", () => {
    const { errors, warnings, unclassified } = analyzeIndex(
      table(row("PROJ-1", "Deployed", SCOPE_UNCLASSIFIED), row("PROJ-2", "Deployed", "full"))
    )
    expect(errors).toEqual([])
    expect(unclassified).toEqual(["PROJ-1"])
    expect(warnings[0]).toMatch(/1 legacy Deployed row/)
  })

  it("refuses the transitional marker on a row that was never deployed", () => {
    const { errors } = analyzeIndex(table(row("PROJ-1", "Planned", SCOPE_UNCLASSIFIED)))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/only for legacy Deployed rows/)
  })

  it("flags an unescaped pipe in prose as a cell-count error", () => {
    // This is the defect PROJ-145 repaired in four rows: `GET|POST` splits the table.
    const { errors } = analyzeIndex(table(row("PROJ-1", "Deployed", "full", "Routes `GET|POST /x`")))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/expected 6/)
  })

  it("accepts an escaped pipe in prose", () => {
    // The load-bearing parsing case: `\|` is prose, not a cell boundary.
    const { errors } = analyzeIndex(
      table(row("PROJ-1", "Deployed", "full", "Routes `GET\\|POST /x`"))
    )
    expect(errors).toEqual([])
  })

  it("reads a bold, parenthesised status as Deployed", () => {
    const { errors } = analyzeIndex(table(row("PROJ-1", "**Deployed (α + β live)**", "alpha")))
    expect(errors).toEqual([])
  })

  it("fails on a table with no feature rows", () => {
    const { errors } = analyzeIndex(table())
    expect(errors.some((e) => e.includes("no PROJ rows"))).toBe(true)
  })
})

describe("features/INDEX.md (the real file)", () => {
  // Pins the shipped file: a hand-edit that breaks a row or invents a scope fails here, not in review.
  const content = fs.readFileSync(
    path.join(process.cwd(), "features", "INDEX.md"),
    "utf8"
  )

  it("has no scope violations", () => {
    expect(analyzeIndex(content).errors).toEqual([])
  })

  it("carries every feature row through the parser", () => {
    const { rows } = analyzeIndex(content)
    const raw = content.split("\n").filter((l) => l.startsWith("| PROJ-")).length
    expect(rows).toHaveLength(raw)
  })
})
