import { describe, expect, it } from "vitest"

import type { WorkItem } from "@/types/work-item"

import {
  formatHours,
  isValidWbsCode,
  outlinePathDepth,
  ownEstimateHours,
  ownPlannedEnd,
  ownPlannedStart,
  totalEffort,
} from "./wbs-display"

const baseItem: WorkItem = {
  id: "00000000-0000-0000-0000-000000000001",
  tenant_id: "00000000-0000-0000-0000-00000000aaaa",
  project_id: "00000000-0000-0000-0000-00000000bbbb",
  kind: "task",
  parent_id: null,
  phase_id: null,
  milestone_id: null,
  sprint_id: null,
  title: "Test",
  description: null,
  status: "todo",
  priority: "medium",
  responsible_user_id: null,
  attributes: {},
  position: null,
  created_from_proposal_id: null,
  created_by: "00000000-0000-0000-0000-00000000cccc",
  created_at: "2026-05-02T12:00:00Z",
  updated_at: "2026-05-02T12:00:00Z",
  is_deleted: false,
}

describe("isValidWbsCode (regex)", () => {
  it("accepts simple dot-separated auto codes", () => {
    expect(isValidWbsCode("1")).toBe(true)
    expect(isValidWbsCode("1.2.3")).toBe(true)
  })
  it("accepts mixed letters/digits/dot/dash/underscore", () => {
    expect(isValidWbsCode("AP-001")).toBe(true)
    expect(isValidWbsCode("Mod_2.AP-007")).toBe(true)
    expect(isValidWbsCode("a")).toBe(true)
  })
  it("rejects whitespace, slashes, special chars", () => {
    expect(isValidWbsCode("AP 001")).toBe(false)
    expect(isValidWbsCode("AP/001")).toBe(false)
    expect(isValidWbsCode("AP@001")).toBe(false)
    expect(isValidWbsCode("Ä-1")).toBe(false)
  })
  it("rejects empty + over-50 chars", () => {
    expect(isValidWbsCode("")).toBe(false)
    expect(isValidWbsCode("A".repeat(51))).toBe(false)
    expect(isValidWbsCode("A".repeat(50))).toBe(true)
  })
})

describe("totalEffort (hybrid display math)", () => {
  it("sums own + derived per OpenProject pattern", () => {
    expect(totalEffort(40, 120)).toBe(160)
  })
  it("treats null as 0 when other side has a value", () => {
    expect(totalEffort(40, null)).toBe(40)
    expect(totalEffort(null, 120)).toBe(120)
  })
  it("returns null when both sides null", () => {
    expect(totalEffort(null, null)).toBeNull()
    expect(totalEffort(undefined, undefined)).toBeNull()
  })
  it("ignores NaN / Infinity (defensive)", () => {
    expect(totalEffort(NaN, 5)).toBe(5)
    expect(totalEffort(Infinity, 5)).toBe(5)
  })
})

describe("outlinePathDepth", () => {
  it("returns segment count for dot-separated paths", () => {
    expect(outlinePathDepth("1")).toBe(1)
    expect(outlinePathDepth("1.2.3")).toBe(3)
    expect(outlinePathDepth("1.2.3.4.5.6.7.8.9.10.11")).toBe(11)
  })
  it("handles null/empty/undefined", () => {
    expect(outlinePathDepth(null)).toBe(0)
    expect(outlinePathDepth(undefined)).toBe(0)
    expect(outlinePathDepth("")).toBe(0)
  })
})

describe("own* readers (attributes JSONB)", () => {
  it("reads planned_start when present", () => {
    expect(
      ownPlannedStart({
        ...baseItem,
        attributes: { planned_start: "2026-05-10" },
      })
    ).toBe("2026-05-10")
  })
  it("returns null when missing or wrong type", () => {
    expect(ownPlannedStart(baseItem)).toBeNull()
    expect(
      ownPlannedStart({ ...baseItem, attributes: { planned_start: 42 } })
    ).toBeNull()
  })
  it("reads planned_end + estimate_hours", () => {
    expect(
      ownPlannedEnd({
        ...baseItem,
        attributes: { planned_end: "2026-06-01" },
      })
    ).toBe("2026-06-01")
    expect(
      ownEstimateHours({
        ...baseItem,
        attributes: { estimate_hours: 40 },
      })
    ).toBe(40)
  })
  it("estimate_hours coerces stringified numbers", () => {
    expect(
      ownEstimateHours({
        ...baseItem,
        attributes: { estimate_hours: "12.5" },
      })
    ).toBe(12.5)
  })
})

describe("formatHours", () => {
  it('returns "—" for null', () => {
    expect(formatHours(null)).toBe("—")
    expect(formatHours(undefined)).toBe("—")
    expect(formatHours(NaN)).toBe("—")
  })
  it("formats numbers with German locale and 'h' suffix", () => {
    const out = formatHours(40)
    expect(out).toMatch(/40 h$/)
  })
})
