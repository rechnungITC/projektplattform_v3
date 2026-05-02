import { describe, expect, it } from "vitest"

import { RISK_SCORE_DEFAULTS } from "./defaults"
import { mergeRiskScoreConfig } from "./merge-overrides"

describe("mergeRiskScoreConfig (PROJ-35-α)", () => {
  it("returns defaults verbatim when overrides are empty", () => {
    expect(mergeRiskScoreConfig({})).toEqual(RISK_SCORE_DEFAULTS)
  })

  it("returns defaults when overrides is null/undefined/not-an-object", () => {
    expect(mergeRiskScoreConfig(null)).toEqual(RISK_SCORE_DEFAULTS)
    expect(mergeRiskScoreConfig(undefined)).toEqual(RISK_SCORE_DEFAULTS)
    expect(mergeRiskScoreConfig("garbage")).toEqual(RISK_SCORE_DEFAULTS)
    expect(mergeRiskScoreConfig(42)).toEqual(RISK_SCORE_DEFAULTS)
  })

  it("merges scalar overrides on top of defaults", () => {
    const merged = mergeRiskScoreConfig({
      influence_weight: 1.5,
      adversity_weight: 0.5,
    })
    expect(merged.influence_weight).toBe(1.5)
    expect(merged.adversity_weight).toBe(0.5)
    expect(merged.impact_weight).toBe(RISK_SCORE_DEFAULTS.impact_weight)
  })

  it("partial bucket-override merges per-key (not replace)", () => {
    const merged = mergeRiskScoreConfig({
      attitude_factor: { blocking: 3.0 },
    })
    expect(merged.attitude_factor.blocking).toBe(3.0)
    expect(merged.attitude_factor.supportive).toBe(
      RISK_SCORE_DEFAULTS.attitude_factor.supportive,
    )
    expect(merged.attitude_factor.neutral).toBe(
      RISK_SCORE_DEFAULTS.attitude_factor.neutral,
    )
  })

  it("ignores invalid override values (NaN, negative, out-of-range, wrong type)", () => {
    const merged = mergeRiskScoreConfig({
      influence_weight: -1, // out of range, schema rejects → defaults applied
      attitude_factor: { blocking: 999 }, // out of range
    })
    expect(merged.influence_weight).toBe(RISK_SCORE_DEFAULTS.influence_weight)
    expect(merged.attitude_factor.blocking).toBe(
      RISK_SCORE_DEFAULTS.attitude_factor.blocking,
    )
  })

  it("ignores unknown override keys", () => {
    const merged = mergeRiskScoreConfig({
      foo: 99,
      attitude_factor: { evil: 99, blocking: 3 } as unknown,
    } as unknown)
    expect(merged.attitude_factor.blocking).toBe(3)
    expect("foo" in merged).toBe(false)
  })

  it("merge result is a new object (never mutates defaults)", () => {
    const before = JSON.parse(JSON.stringify(RISK_SCORE_DEFAULTS))
    mergeRiskScoreConfig({ influence_weight: 99 })
    expect(RISK_SCORE_DEFAULTS).toEqual(before)
  })
})
