import { describe, expect, it } from "vitest"

import { computeRiskScore } from "./compute"
import { RISK_SCORE_DEFAULTS } from "./defaults"

const baseInput = {
  influence: "medium" as const,
  impact: "medium" as const,
  attitude: "neutral" as const,
  conflict_potential: "medium" as const,
  decision_authority: "advisory" as const,
  agreeableness_fremd: 70,
}

describe("computeRiskScore (PROJ-35-α)", () => {
  it("neutral baseline → low score (green bucket)", () => {
    const r = computeRiskScore(baseInput, RISK_SCORE_DEFAULTS)
    // 1.0 × 0.5 × 1.0 × 0.5 × 1.0 (neutral) × 1.0 (med-conflict)
    //   × (1 - 0.7 × 0.3) × 0.8 (advisory) = 0.5 × 0.5 × 0.79 × 0.8 = 0.158
    expect(r.score).toBeGreaterThan(0)
    expect(r.score).toBeLessThan(1)
    expect(r.bucket).toBe("green")
  })

  it("worst-case (blocking, deciding, critical, low agreeableness, all-critical) → red", () => {
    const r = computeRiskScore(
      {
        influence: "critical",
        impact: "critical",
        attitude: "blocking",
        conflict_potential: "critical",
        decision_authority: "deciding",
        agreeableness_fremd: 5,
      },
      RISK_SCORE_DEFAULTS,
    )
    // 1.0 × 1.0 × 1.0 × 1.0 × 2.5 × 2.0 × ~0.985 × 1.5 = ~7.39
    expect(r.score).toBeGreaterThan(6)
    expect(r.bucket).toBe("red")
  })

  it("clamps the upper bound at 10 even with extreme overrides", () => {
    const r = computeRiskScore(
      {
        influence: "critical",
        impact: "critical",
        attitude: "blocking",
        conflict_potential: "critical",
        decision_authority: "deciding",
        agreeableness_fremd: 0,
      },
      {
        ...RISK_SCORE_DEFAULTS,
        influence_weight: 5,
        impact_weight: 5,
      },
    )
    expect(r.score).toBe(10)
    expect(r.bucket).toBe("red")
  })

  it("null Big5 → big5_modifier=1.0 + big5_missing=true", () => {
    const r = computeRiskScore(
      { ...baseInput, agreeableness_fremd: null },
      RISK_SCORE_DEFAULTS,
    )
    expect(r.factors.big5_modifier).toBe(1)
    expect(r.big5_missing).toBe(true)
  })

  it("non-null Big5 sets big5_missing=false", () => {
    const r = computeRiskScore(baseInput, RISK_SCORE_DEFAULTS)
    expect(r.big5_missing).toBe(false)
  })

  it("null influence → influence_norm 0 → score 0 (no impact factor)", () => {
    const r = computeRiskScore(
      { ...baseInput, influence: null },
      RISK_SCORE_DEFAULTS,
    )
    expect(r.score).toBe(0)
    expect(r.bucket).toBe("green")
  })

  it("identical input + config → identical score (determinism)", () => {
    const r1 = computeRiskScore(baseInput, RISK_SCORE_DEFAULTS)
    const r2 = computeRiskScore(baseInput, RISK_SCORE_DEFAULTS)
    expect(r1).toEqual(r2)
  })

  it("score is rounded to 2 decimals (UI-friendly)", () => {
    const r = computeRiskScore(baseInput, RISK_SCORE_DEFAULTS)
    const decimals = (r.score.toString().split(".")[1] ?? "").length
    expect(decimals).toBeLessThanOrEqual(2)
  })

  it("breakdown reports all 6 factors for tooltip rendering", () => {
    const r = computeRiskScore(baseInput, RISK_SCORE_DEFAULTS)
    expect(r.factors).toHaveProperty("influence_norm")
    expect(r.factors).toHaveProperty("impact_norm")
    expect(r.factors).toHaveProperty("attitude_factor")
    expect(r.factors).toHaveProperty("conflict_factor")
    expect(r.factors).toHaveProperty("authority_factor")
    expect(r.factors).toHaveProperty("big5_modifier")
  })

  it("custom config (tenant override) applies", () => {
    const r = computeRiskScore(
      { ...baseInput, attitude: "blocking" },
      {
        ...RISK_SCORE_DEFAULTS,
        attitude_factor: {
          ...RISK_SCORE_DEFAULTS.attitude_factor,
          blocking: 5.0,
        },
      },
    )
    // Compare with default blocking=2.5 multiplier
    const rDefault = computeRiskScore(
      { ...baseInput, attitude: "blocking" },
      RISK_SCORE_DEFAULTS,
    )
    expect(r.score).toBeGreaterThan(rDefault.score)
  })
})
