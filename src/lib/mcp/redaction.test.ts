/**
 * PROJ-48 — Class-3 redaction at the MCP boundary.
 */
import { describe, expect, it } from "vitest"

import { redactRow, redactRows } from "./redaction"

describe("redactRow", () => {
  it("drops Class-3 fields and keeps Class-1/2", () => {
    const { row, redactedFields } = redactRow("projects", {
      id: "p1",
      name: "Alpha", // class 2
      lifecycle_status: "active", // class 1
      responsible_user_id: "u1", // class 3 → drop
    })
    expect(row).toEqual({ id: "p1", name: "Alpha", lifecycle_status: "active" })
    expect(redactedFields).toEqual(["responsible_user_id"])
  })

  it("default-denies unknown columns (treats them as Class 3)", () => {
    const { row, redactedFields } = redactRow("work_items", {
      id: "w1", // registered class 1
      title: "T", // class 2
      secret_unregistered_col: "leak?", // unknown → class 3 → drop
    })
    expect(row).toEqual({ id: "w1", title: "T" })
    expect(redactedFields).toContain("secret_unregistered_col")
  })

  it("respects a relaxed tenant default for unknown fields only", () => {
    const { row } = redactRow(
      "work_items",
      { id: "w1", custom_field: "ok" },
      2, // tenant relaxes unknown fields to class 2
    )
    expect(row).toEqual({ id: "w1", custom_field: "ok" })
  })

  it("never relaxes a registered Class-3 field even with tenant default 1", () => {
    const { row, redactedFields } = redactRow(
      "projects",
      { id: "p1", responsible_user_id: "u1" },
      1,
    )
    expect(row).toEqual({ id: "p1" })
    expect(redactedFields).toEqual(["responsible_user_id"])
  })
})

describe("redactRows", () => {
  it("aggregates redaction count across rows and dedupes field names", () => {
    const { rows, redactionCount, redactedFields } = redactRows("projects", [
      { id: "p1", name: "A", responsible_user_id: "u1" },
      { id: "p2", name: "B", responsible_user_id: "u2" },
    ])
    expect(rows).toEqual([
      { id: "p1", name: "A" },
      { id: "p2", name: "B" },
    ])
    expect(redactionCount).toBe(2)
    expect(redactedFields).toEqual(["responsible_user_id"])
  })

  it("emits only metadata columns for report_snapshots (content/generated_by withheld)", () => {
    const { rows, redactedFields } = redactRows("report_snapshots", [
      {
        id: "r1",
        kind: "status",
        version: 3,
        generated_at: "2026-01-01",
        ki_provider: "openai",
        generated_by: "u1", // not registered → class 3 → drop
        content: { secret: true }, // not registered → class 3 → drop
      },
    ])
    expect(rows[0]).toEqual({
      id: "r1",
      kind: "status",
      version: 3,
      generated_at: "2026-01-01",
      ki_provider: "openai",
    })
    expect(redactedFields).toEqual(["content", "generated_by"])
  })
})
