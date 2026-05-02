import { describe, expect, it } from "vitest"

import {
  detectEscalationPatterns,
  ESCALATION_PATTERN_META,
} from "./escalation-patterns"

const empty = {
  attitude: null,
  conflict_potential: null,
  decision_authority: null,
  influence: null,
  agreeableness_fremd: null,
  emotional_stability_fremd: null,
}

describe("detectEscalationPatterns (PROJ-35-α)", () => {
  it("empty input → no patterns", () => {
    expect(detectEscalationPatterns(empty)).toEqual([])
  })

  it("blocker_decider — attitude=blocking + authority=deciding", () => {
    expect(
      detectEscalationPatterns({
        ...empty,
        attitude: "blocking",
        decision_authority: "deciding",
      }),
    ).toEqual(["blocker_decider"])
  })

  it("amplified_conflict — critical + high-influence", () => {
    expect(
      detectEscalationPatterns({
        ...empty,
        conflict_potential: "critical",
        influence: "high",
      }),
    ).toEqual(["amplified_conflict"])
  })

  it("amplified_conflict — also fires on critical-influence (with attitude set)", () => {
    expect(
      detectEscalationPatterns({
        ...empty,
        attitude: "neutral", // prevent unknown_critical from firing
        conflict_potential: "critical",
        influence: "critical",
      }),
    ).toEqual(["amplified_conflict"])
  })

  it("amplified_conflict — does NOT fire on medium-influence", () => {
    expect(
      detectEscalationPatterns({
        ...empty,
        conflict_potential: "critical",
        influence: "medium",
      }),
    ).toEqual([])
  })

  it("dark_profile — agreeableness<30 + emotional_stability<30 + attitude in {critical,blocking}", () => {
    expect(
      detectEscalationPatterns({
        ...empty,
        agreeableness_fremd: 20,
        emotional_stability_fremd: 20,
        attitude: "blocking",
      }),
    ).toContain("dark_profile")
    expect(
      detectEscalationPatterns({
        ...empty,
        agreeableness_fremd: 25,
        emotional_stability_fremd: 25,
        attitude: "critical",
      }),
    ).toContain("dark_profile")
  })

  it("dark_profile — does NOT fire when attitude is supportive/neutral", () => {
    expect(
      detectEscalationPatterns({
        ...empty,
        agreeableness_fremd: 10,
        emotional_stability_fremd: 10,
        attitude: "supportive",
      }),
    ).toEqual([])
  })

  it("dark_profile — does NOT fire when one of the Big5 inputs is null", () => {
    expect(
      detectEscalationPatterns({
        ...empty,
        agreeableness_fremd: null,
        emotional_stability_fremd: 10,
        attitude: "blocking",
      }),
    ).not.toContain("dark_profile")
  })

  it("dark_profile — does NOT fire when threshold (30) is reached", () => {
    expect(
      detectEscalationPatterns({
        ...empty,
        agreeableness_fremd: 30,
        emotional_stability_fremd: 10,
        attitude: "blocking",
      }),
    ).not.toContain("dark_profile")
  })

  it("unknown_critical — attitude null + influence critical", () => {
    expect(
      detectEscalationPatterns({
        ...empty,
        attitude: null,
        influence: "critical",
      }),
    ).toEqual(["unknown_critical"])
  })

  it("unknown_critical — does NOT fire on non-critical influence", () => {
    expect(
      detectEscalationPatterns({
        ...empty,
        attitude: null,
        influence: "high",
      }),
    ).toEqual([])
  })

  it("multi-pattern: blocker_decider + amplified_conflict + dark_profile fire together", () => {
    const result = detectEscalationPatterns({
      attitude: "blocking",
      decision_authority: "deciding",
      conflict_potential: "critical",
      influence: "critical",
      agreeableness_fremd: 10,
      emotional_stability_fremd: 10,
    })
    expect(result).toContain("blocker_decider")
    expect(result).toContain("amplified_conflict")
    expect(result).toContain("dark_profile")
    // unknown_critical requires attitude=null → mutually exclusive with the others
    expect(result).not.toContain("unknown_critical")
  })

  it("ESCALATION_PATTERN_META has entries for all 4 keys with severity 1..5", () => {
    const keys: Array<keyof typeof ESCALATION_PATTERN_META> = [
      "blocker_decider",
      "amplified_conflict",
      "dark_profile",
      "unknown_critical",
    ]
    for (const k of keys) {
      const m = ESCALATION_PATTERN_META[k]
      expect(m.key).toBe(k)
      expect(m.severity).toBeGreaterThanOrEqual(1)
      expect(m.severity).toBeLessThanOrEqual(5)
      expect(m.label.length).toBeGreaterThan(0)
      expect(m.recommendation.length).toBeGreaterThan(0)
    }
  })
})
