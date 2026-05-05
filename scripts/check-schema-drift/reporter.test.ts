import { describe, expect, it } from "vitest"

import { formatDriftBlock, formatFailure, formatSuccess } from "./reporter"
import type { Drift, DiffResult } from "./diff"

describe("formatSuccess", () => {
  it("renders pluralization correctly", () => {
    const result: DiffResult = {
      drifts: [],
      skipped: [],
      validatedCalls: 7,
    }
    expect(formatSuccess(result, 3)).toBe(
      "✓ schema-drift: 7 SELECT calls verified across 3 tables — 0 drift."
    )
  })

  it("renders singular variants", () => {
    const result: DiffResult = {
      drifts: [],
      skipped: [],
      validatedCalls: 1,
    }
    expect(formatSuccess(result, 1)).toContain("1 SELECT call verified across 1 table")
  })

  it("appends a skipped-dynamic note when relevant", () => {
    const result: DiffResult = {
      drifts: [],
      skipped: [{ file: "/x.ts", line: 1, reason: "dynamic" }],
      validatedCalls: 4,
    }
    expect(formatSuccess(result, 2)).toContain("1 dynamic call skipped")
  })
})

describe("formatDriftBlock", () => {
  it("renders all sections", () => {
    const drift: Drift = {
      file: "/repo/src/foo.ts",
      line: 42,
      table: "work_items",
      missingColumns: ["outline_path", "wbs_code"],
      availableColumns: ["id", "title"],
    }
    const text = formatDriftBlock(drift)
    expect(text).toContain("/repo/src/foo.ts:42")
    expect(text).toContain("table:    work_items")
    expect(text).toContain("missing:  outline_path, wbs_code")
    expect(text).toContain("available: id, title")
  })

  it("truncates very long available column lists", () => {
    const cols = Array.from({ length: 25 }, (_, i) => `col_${i.toString().padStart(2, "0")}`)
    const drift: Drift = {
      file: "/x.ts",
      line: 1,
      table: "wide_table",
      missingColumns: ["banana"],
      availableColumns: cols,
    }
    const text = formatDriftBlock(drift)
    expect(text).toContain("and 5 more")
    expect(text).toContain("col_19")
    expect(text).not.toContain("col_20")
  })

  it("notes missing-table case explicitly", () => {
    const drift: Drift = {
      file: "/x.ts",
      line: 1,
      table: "ghost_table",
      missingColumns: ["id"],
      availableColumns: [],
    }
    expect(formatDriftBlock(drift)).toContain("<table not in schema dump>")
  })
})

describe("formatFailure", () => {
  it("renders header + drift blocks + trailer for skipped", () => {
    const result: DiffResult = {
      drifts: [
        {
          file: "/foo.ts",
          line: 10,
          table: "work_items",
          missingColumns: ["outline_path"],
          availableColumns: ["id", "title"],
        },
      ],
      skipped: [{ file: "/dyn.ts", line: 5, reason: "dynamic" }],
      validatedCalls: 3,
    }
    const text = formatFailure(result)
    expect(text).toContain("1 drift detected")
    expect(text).toContain("missing:  outline_path")
    expect(text).toContain("dynamic call was skipped")
  })
})
