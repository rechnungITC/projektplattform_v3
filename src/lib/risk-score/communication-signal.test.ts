import { describe, expect, it } from "vitest"

import { aggregateCommunicationSignal } from "./communication-signal"
import { RISK_SCORE_DEFAULTS } from "./defaults"
import { computeRiskScore } from "./compute"
import { mergeRiskScoreConfig } from "./merge-overrides"

// PROJ-34-ζ — communication-signal aggregation + risk-score integration.

describe("aggregateCommunicationSignal", () => {
  it("returns null when there are no signals and no overdue", () => {
    expect(
      aggregateCommunicationSignal({ rows: [], overdue_count: 0 }),
    ).toBeNull()
  })

  it("averages positive sentiment + cooperation to a positive signal", () => {
    const value = aggregateCommunicationSignal({
      rows: [
        { participant_sentiment: 2, participant_cooperation_signal: 2 },
        { participant_sentiment: 1, participant_cooperation_signal: 1 },
      ],
      overdue_count: 0,
    })
    expect(value).toBeGreaterThan(0.7)
  })

  it("averages negative sentiment + cooperation to a negative signal", () => {
    const value = aggregateCommunicationSignal({
      rows: [
        { participant_sentiment: -2, participant_cooperation_signal: -1 },
      ],
      overdue_count: 0,
    })
    expect(value).toBeLessThan(-0.5)
  })

  it("penalises overdue counts even when sentiment is unknown", () => {
    const value = aggregateCommunicationSignal({
      rows: [],
      overdue_count: 3,
    })
    // -0.3 = -min(0.5, 0.1 * 3)
    expect(value).toBeCloseTo(-0.3, 5)
  })

  it("clamps the penalty so a flood of overdue items doesn't dominate", () => {
    const value = aggregateCommunicationSignal({
      rows: [{ participant_sentiment: 2, participant_cooperation_signal: 2 }],
      overdue_count: 50,
    })
    expect(value).toBeGreaterThanOrEqual(-1)
    expect(value).toBeCloseTo(1 - 0.5, 5)
  })
})

describe("computeRiskScore with communication_weight (CIA-L4 opt-in)", () => {
  const baseInput = {
    influence: "critical" as const,
    impact: "critical" as const,
    attitude: "blocking" as const,
    conflict_potential: "high" as const,
    decision_authority: "deciding" as const,
    agreeableness_fremd: 30,
  }

  it("opt-out default (weight=0) returns the same score whether or not signal is supplied", () => {
    const noSignal = computeRiskScore(baseInput, RISK_SCORE_DEFAULTS)
    const withSignal = computeRiskScore(
      { ...baseInput, communication_signal: -1 },
      RISK_SCORE_DEFAULTS,
    )
    expect(withSignal.score).toBe(noSignal.score)
    expect(withSignal.communication_missing).toBe(true)
  })

  it("opt-in with negative signal raises the score above the no-signal baseline", () => {
    const cfg = mergeRiskScoreConfig({ communication_weight: 0.3 })
    const baseline = computeRiskScore(baseInput, cfg)
    const elevated = computeRiskScore(
      { ...baseInput, communication_signal: -1 },
      cfg,
    )
    expect(elevated.score).toBeGreaterThan(baseline.score)
    expect(elevated.communication_missing).toBe(false)
    expect(elevated.factors.communication_modifier).toBe(1.3)
  })

  it("opt-in with positive signal lowers the score below the no-signal baseline", () => {
    const cfg = mergeRiskScoreConfig({ communication_weight: 0.3 })
    const baseline = computeRiskScore(baseInput, cfg)
    const dampened = computeRiskScore(
      { ...baseInput, communication_signal: 1 },
      cfg,
    )
    expect(dampened.score).toBeLessThan(baseline.score)
    expect(dampened.factors.communication_modifier).toBe(0.7)
  })

  it("merge tolerates out-of-range overrides and falls back to default", () => {
    const cfg = mergeRiskScoreConfig({ communication_weight: 99 })
    expect(cfg.communication_weight).toBe(
      RISK_SCORE_DEFAULTS.communication_weight,
    )
  })
})
