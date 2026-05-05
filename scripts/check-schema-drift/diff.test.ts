import { describe, expect, it } from "vitest"

import { diffCalls } from "./diff"
import type { SelectCall } from "./ast-walker"

const schema = new Map([
  ["work_items", new Set(["id", "title", "status", "outline_path"])],
  ["projects", new Set(["id", "name"])],
])

const baseCall: SelectCall = {
  file: "/repo/src/foo.ts",
  line: 42,
  table: "work_items",
  rawSelect: "id, title",
  dynamic: false,
}

describe("diffCalls", () => {
  it("passes when every column exists in the schema", () => {
    const result = diffCalls([baseCall], schema)
    expect(result.drifts).toHaveLength(0)
    expect(result.validatedCalls).toBe(1)
  })

  it("flags a missing column", () => {
    const result = diffCalls(
      [{ ...baseCall, rawSelect: "id, title, banana" }],
      schema
    )
    expect(result.drifts).toHaveLength(1)
    expect(result.drifts[0].missingColumns).toEqual(["banana"])
    expect(result.drifts[0].availableColumns).toContain("title")
  })

  it("flags a missing table as drift with empty availableColumns", () => {
    const result = diffCalls(
      [{ ...baseCall, table: "nonexistent_table", rawSelect: "id" }],
      schema
    )
    expect(result.drifts).toHaveLength(1)
    expect(result.drifts[0].availableColumns).toEqual([])
  })

  it("skips wildcard selects without flagging drift", () => {
    const result = diffCalls(
      [{ ...baseCall, rawSelect: "*" }],
      schema
    )
    expect(result.drifts).toHaveLength(0)
    expect(result.validatedCalls).toBe(1)
  })

  it("skips dynamic selects and records them in skipped[]", () => {
    const result = diffCalls(
      [
        {
          file: "/repo/src/dyn.ts",
          line: 10,
          table: "work_items",
          rawSelect: null,
          dynamic: true,
          dynamicReason: "select() argument is not a string literal",
        },
      ],
      schema
    )
    expect(result.drifts).toHaveLength(0)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toContain("select()")
  })

  it("does not flag embedded relations as drift", () => {
    const result = diffCalls(
      [
        {
          ...baseCall,
          rawSelect:
            "id, title, responsible:profiles!fk(name, email)",
        },
      ],
      schema
    )
    expect(result.drifts).toHaveLength(0)
  })

  it("strips column aliases before checking", () => {
    const result = diffCalls(
      [{ ...baseCall, rawSelect: "display:title, internal:id" }],
      schema
    )
    expect(result.drifts).toHaveLength(0)
  })

  it("reports the exact incident class — outline_path missing", () => {
    // Reproduces the 2026-05-04 production drift: useWorkItems selecting
    // outline_path when the column does not exist in the DB.
    const incidentSchema = new Map([
      ["work_items", new Set(["id", "title"])],
    ])
    const result = diffCalls(
      [{ ...baseCall, rawSelect: "id, title, outline_path" }],
      incidentSchema
    )
    expect(result.drifts).toHaveLength(1)
    expect(result.drifts[0].missingColumns).toEqual(["outline_path"])
  })
})
