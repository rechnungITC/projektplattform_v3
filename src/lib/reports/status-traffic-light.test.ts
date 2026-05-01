import { describe, expect, it } from "vitest"

import type { SnapshotMilestoneRef, SnapshotRiskRef } from "./types"
import {
  CRITICAL_RISK_SCORE_THRESHOLD,
  computeStatusTrafficLight,
  countCriticalOpenRisks,
  countOverdueMilestones,
  isCriticalOpenRisk,
  isOverdueMilestone,
} from "./status-traffic-light"

const NOW = new Date("2026-05-01T12:00:00Z")

function risk(overrides: Partial<SnapshotRiskRef>): SnapshotRiskRef {
  return {
    id: "r-1",
    title: "test risk",
    probability: 1,
    impact: 1,
    score: 1,
    status: "open",
    ...overrides,
  }
}

function milestone(
  overrides: Partial<SnapshotMilestoneRef>,
): SnapshotMilestoneRef {
  return {
    id: "m-1",
    name: "test milestone",
    due_date: "2026-05-15T00:00:00Z",
    status: "planned",
    phase_id: null,
    ...overrides,
  }
}

describe("isCriticalOpenRisk", () => {
  it("flags an open risk at the threshold score", () => {
    expect(
      isCriticalOpenRisk(
        risk({ score: CRITICAL_RISK_SCORE_THRESHOLD, status: "open" }),
      ),
    ).toBe(true)
  })

  it("flags an open risk above the threshold", () => {
    expect(isCriticalOpenRisk(risk({ score: 25, status: "open" }))).toBe(true)
  })

  it("does not flag a sub-threshold risk", () => {
    expect(isCriticalOpenRisk(risk({ score: 15, status: "open" }))).toBe(false)
  })

  it("never flags a non-open risk regardless of score", () => {
    for (const status of ["mitigated", "accepted", "closed"] as const) {
      expect(isCriticalOpenRisk(risk({ score: 25, status }))).toBe(false)
    }
  })
})

describe("isOverdueMilestone", () => {
  it("flags a milestone with a past due_date that is not completed", () => {
    expect(
      isOverdueMilestone(
        milestone({ due_date: "2026-04-01T00:00:00Z", status: "planned" }),
        NOW,
      ),
    ).toBe(true)
  })

  it("does not flag a future milestone", () => {
    expect(
      isOverdueMilestone(
        milestone({ due_date: "2027-01-01T00:00:00Z", status: "planned" }),
        NOW,
      ),
    ).toBe(false)
  })

  it("never flags a milestone with no due date", () => {
    expect(
      isOverdueMilestone(milestone({ due_date: null }), NOW),
    ).toBe(false)
  })

  for (const status of ["completed", "achieved", "closed", "cancelled"]) {
    it(`does not flag a milestone with status='${status}' even if due_date is past`, () => {
      expect(
        isOverdueMilestone(
          milestone({ due_date: "2026-04-01T00:00:00Z", status }),
          NOW,
        ),
      ).toBe(false)
    })
  }

  it("treats malformed due_date strings as not-overdue (defensive)", () => {
    expect(
      isOverdueMilestone(milestone({ due_date: "not-a-date" }), NOW),
    ).toBe(false)
  })
})

describe("countOverdueMilestones / countCriticalOpenRisks", () => {
  it("counts only the entries that match the predicate", () => {
    expect(
      countOverdueMilestones(
        [
          milestone({ id: "a", due_date: "2026-04-01T00:00:00Z" }),
          milestone({ id: "b", due_date: "2027-01-01T00:00:00Z" }),
          milestone({
            id: "c",
            due_date: "2026-04-01T00:00:00Z",
            status: "completed",
          }),
        ],
        NOW,
      ),
    ).toBe(1)

    expect(
      countCriticalOpenRisks([
        risk({ id: "1", score: 16, status: "open" }),
        risk({ id: "2", score: 25, status: "open" }),
        risk({ id: "3", score: 25, status: "closed" }),
        risk({ id: "4", score: 8, status: "open" }),
      ]),
    ).toBe(2)
  })
})

describe("computeStatusTrafficLight", () => {
  it("GREEN — no overdue + no critical risks", () => {
    expect(
      computeStatusTrafficLight({
        milestones: [],
        risks: [],
        now: NOW,
      }),
    ).toEqual({ light: "green", overdue_milestone_count: 0, critical_risk_count: 0 })
  })

  it("GREEN — only future milestones + low-score risks", () => {
    expect(
      computeStatusTrafficLight({
        milestones: [milestone({ due_date: "2027-01-01T00:00:00Z" })],
        risks: [risk({ score: 4, status: "open" })],
        now: NOW,
      }).light,
    ).toBe("green")
  })

  it("YELLOW — exactly 1 overdue milestone, no critical risks", () => {
    expect(
      computeStatusTrafficLight({
        milestones: [milestone({ due_date: "2026-04-01T00:00:00Z" })],
        risks: [],
        now: NOW,
      }).light,
    ).toBe("yellow")
  })

  it("YELLOW — exactly 2 overdue milestones, no critical risks", () => {
    expect(
      computeStatusTrafficLight({
        milestones: [
          milestone({ id: "a", due_date: "2026-04-01T00:00:00Z" }),
          milestone({ id: "b", due_date: "2026-04-15T00:00:00Z" }),
        ],
        risks: [],
        now: NOW,
      }).light,
    ).toBe("yellow")
  })

  it("YELLOW — exactly 1 critical risk, no overdue milestones", () => {
    expect(
      computeStatusTrafficLight({
        milestones: [],
        risks: [risk({ score: 25, status: "open" })],
        now: NOW,
      }).light,
    ).toBe("yellow")
  })

  it("RED — 3 overdue milestones", () => {
    expect(
      computeStatusTrafficLight({
        milestones: [
          milestone({ id: "a", due_date: "2026-04-01T00:00:00Z" }),
          milestone({ id: "b", due_date: "2026-04-15T00:00:00Z" }),
          milestone({ id: "c", due_date: "2026-04-20T00:00:00Z" }),
        ],
        risks: [],
        now: NOW,
      }).light,
    ).toBe("red")
  })

  it("RED — 2 critical risks", () => {
    expect(
      computeStatusTrafficLight({
        milestones: [],
        risks: [
          risk({ id: "1", score: 25, status: "open" }),
          risk({ id: "2", score: 16, status: "open" }),
        ],
        now: NOW,
      }).light,
    ).toBe("red")
  })

  it("RED — 1 overdue + 1 critical risk (mix)", () => {
    expect(
      computeStatusTrafficLight({
        milestones: [milestone({ due_date: "2026-04-01T00:00:00Z" })],
        risks: [risk({ score: 25, status: "open" })],
        now: NOW,
      }).light,
    ).toBe("red")
  })

  it("uses Date.now() when no reference date is provided", () => {
    // Smoke test: the function still returns a valid traffic-light value
    // when called without `now`.
    const result = computeStatusTrafficLight({
      milestones: [milestone({ due_date: "2099-01-01T00:00:00Z" })],
      risks: [],
    })
    expect(["green", "yellow", "red"]).toContain(result.light)
  })

  it("returns the underlying counts alongside the light", () => {
    const result = computeStatusTrafficLight({
      milestones: [
        milestone({ id: "a", due_date: "2026-04-01T00:00:00Z" }),
        milestone({ id: "b", due_date: "2027-01-01T00:00:00Z" }),
      ],
      risks: [
        risk({ id: "1", score: 25, status: "open" }),
        risk({ id: "2", score: 9, status: "open" }),
      ],
      now: NOW,
    })
    expect(result.overdue_milestone_count).toBe(1)
    expect(result.critical_risk_count).toBe(1)
  })
})
