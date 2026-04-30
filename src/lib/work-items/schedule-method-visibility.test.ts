import { describe, expect, it } from "vitest"

import { PROJECT_METHODS } from "@/types/project-method"

import {
  SCHEDULE_CONSTRUCT_KINDS,
  SCHEDULE_CONSTRUCT_METHOD_VISIBILITY,
  isScheduleConstructAllowedInMethod,
  scheduleConstructRejectionMessage,
} from "./schedule-method-visibility"

describe("SCHEDULE_CONSTRUCT_METHOD_VISIBILITY", () => {
  it("pins sprints to agile methods only", () => {
    expect(SCHEDULE_CONSTRUCT_METHOD_VISIBILITY.sprints.sort()).toEqual([
      "safe",
      "scrum",
    ])
  })

  it("pins phases to plan-driven methods only", () => {
    expect(SCHEDULE_CONSTRUCT_METHOD_VISIBILITY.phases.sort()).toEqual([
      "pmi",
      "prince2",
      "vxt2",
      "waterfall",
    ])
  })

  it("pins milestones to plan-driven methods only", () => {
    expect(SCHEDULE_CONSTRUCT_METHOD_VISIBILITY.milestones.sort()).toEqual([
      "pmi",
      "prince2",
      "vxt2",
      "waterfall",
    ])
  })

  it("references only valid project methods", () => {
    const allMethods = new Set(PROJECT_METHODS)
    for (const kind of SCHEDULE_CONSTRUCT_KINDS) {
      for (const method of SCHEDULE_CONSTRUCT_METHOD_VISIBILITY[kind]) {
        expect(allMethods.has(method)).toBe(true)
      }
    }
  })
})

describe("isScheduleConstructAllowedInMethod", () => {
  it("returns true for null method (setup phase) for every construct", () => {
    for (const kind of SCHEDULE_CONSTRUCT_KINDS) {
      expect(isScheduleConstructAllowedInMethod(kind, null)).toBe(true)
    }
  })

  // Pin every (construct × method) combination so accidental edits fail loud.
  // 21 cases = 3 constructs × 7 methods.
  it.each([
    ["sprints", "scrum", true],
    ["sprints", "safe", true],
    ["sprints", "kanban", false],
    ["sprints", "waterfall", false],
    ["sprints", "pmi", false],
    ["sprints", "prince2", false],
    ["sprints", "vxt2", false],
    ["phases", "waterfall", true],
    ["phases", "pmi", true],
    ["phases", "prince2", true],
    ["phases", "vxt2", true],
    ["phases", "scrum", false],
    ["phases", "kanban", false],
    ["phases", "safe", false],
    ["milestones", "waterfall", true],
    ["milestones", "pmi", true],
    ["milestones", "prince2", true],
    ["milestones", "vxt2", true],
    ["milestones", "scrum", false],
    ["milestones", "kanban", false],
    ["milestones", "safe", false],
  ] as const)(
    "(%s, %s) → %s",
    (kind, method, expected) => {
      expect(isScheduleConstructAllowedInMethod(kind, method)).toBe(expected)
    }
  )
})

describe("scheduleConstructRejectionMessage", () => {
  it("includes the method name and a helpful pointer for sprints", () => {
    const msg = scheduleConstructRejectionMessage("sprints", "waterfall")
    expect(msg).toContain("WATERFALL")
    expect(msg).toContain("Sub-Projekt")
    expect(msg).toContain("Sprint")
  })

  it("includes the method name for phases", () => {
    const msg = scheduleConstructRejectionMessage("phases", "scrum")
    expect(msg).toContain("SCRUM")
    expect(msg).toContain("Phase")
  })

  it("includes the method name for milestones", () => {
    const msg = scheduleConstructRejectionMessage("milestones", "kanban")
    expect(msg).toContain("KANBAN")
    expect(msg).toContain("Meilenstein")
  })
})
