import { describe, expect, it } from "vitest"

import {
  COVERAGE_THRESHOLD,
  FLAG_DELTA_THRESHOLD,
  computeBig5Gap,
  computeSkillGap,
} from "./perception-gap"

const baseSkill = {
  stakeholder_id: "11111111-1111-1111-1111-111111111111",
  tenant_id: "22222222-2222-2222-2222-222222222222",
  domain_knowledge_fremd: 70,
  domain_knowledge_self: null,
  method_competence_fremd: 60,
  method_competence_self: null,
  it_affinity_fremd: 80,
  it_affinity_self: null,
  negotiation_skill_fremd: 50,
  negotiation_skill_self: null,
  decision_power_fremd: 70,
  decision_power_self: null,
  fremd_assessed_by: null,
  fremd_assessed_at: null,
  self_assessed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
} as unknown as Parameters<typeof computeSkillGap>[0]

const baseBig5 = {
  stakeholder_id: "11111111-1111-1111-1111-111111111111",
  tenant_id: "22222222-2222-2222-2222-222222222222",
  openness_fremd: 70,
  openness_self: null,
  conscientiousness_fremd: 60,
  conscientiousness_self: null,
  extraversion_fremd: 50,
  extraversion_self: null,
  agreeableness_fremd: 40,
  agreeableness_self: null,
  emotional_stability_fremd: 60,
  emotional_stability_self: null,
  fremd_assessed_by: null,
  fremd_assessed_at: null,
  self_assessed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
} as unknown as Parameters<typeof computeBig5Gap>[0]

describe("computeSkillGap (PROJ-35-α)", () => {
  it("null profile → status='no_self'", () => {
    expect(computeSkillGap(null).status).toBe("no_self")
  })

  it("zero self-values → status='no_self'", () => {
    expect(computeSkillGap(baseSkill).status).toBe("no_self")
  })

  it("self in 1 of 5 dimensions → low_coverage (20% < 60%)", () => {
    const r = computeSkillGap({
      ...baseSkill!,
      domain_knowledge_self: 90,
    })
    expect(r.status).toBe("low_coverage")
    expect(r.coverage).toBeLessThan(COVERAGE_THRESHOLD)
    expect(r.flagged).toBe(false)
  })

  it("self in 3 of 5 dimensions → computed (60% = threshold)", () => {
    const r = computeSkillGap({
      ...baseSkill!,
      domain_knowledge_self: 90,
      method_competence_self: 60,
      it_affinity_self: 80,
    })
    expect(r.status).toBe("computed")
    expect(r.coverage).toBeCloseTo(0.6, 5)
    expect(r.dimensions.length).toBe(3)
  })

  it("flagged when max_delta >= 30", () => {
    const r = computeSkillGap({
      ...baseSkill!,
      domain_knowledge_self: 100, // delta = +30
      method_competence_self: 60,
      it_affinity_self: 80,
    })
    expect(r.flagged).toBe(true)
    expect(r.max_delta).toBeGreaterThanOrEqual(FLAG_DELTA_THRESHOLD)
  })

  it("not flagged when max_delta < 30", () => {
    const r = computeSkillGap({
      ...baseSkill!,
      domain_knowledge_self: 80, // delta = +10
      method_competence_self: 60,
      it_affinity_self: 80,
    })
    expect(r.flagged).toBe(false)
  })

  it("dimensions sorted by |delta| DESC", () => {
    const r = computeSkillGap({
      ...baseSkill!,
      domain_knowledge_self: 100, // delta = +30
      method_competence_self: 30, // delta = -30
      it_affinity_self: 75, // delta = -5
    })
    // First two have |delta|=30, last has |delta|=5
    expect(Math.abs(r.dimensions[0]!.delta)).toBeGreaterThanOrEqual(
      Math.abs(r.dimensions[r.dimensions.length - 1]!.delta),
    )
  })

  it("delta sign reflects self - fremd", () => {
    const r = computeSkillGap({
      ...baseSkill!,
      domain_knowledge_self: 100,
      method_competence_self: 60,
      it_affinity_self: 80,
    })
    const dim = r.dimensions.find((d) => d.dimension === "domain_knowledge")
    expect(dim?.delta).toBe(30) // self(100) - fremd(70)
  })
})

describe("computeBig5Gap (PROJ-35-α)", () => {
  it("null profile → status='no_self'", () => {
    expect(computeBig5Gap(null).status).toBe("no_self")
  })

  it("self in all 5 dimensions → computed, coverage=1.0", () => {
    const r = computeBig5Gap({
      ...baseBig5!,
      openness_self: 90,
      conscientiousness_self: 70,
      extraversion_self: 50,
      agreeableness_self: 60,
      emotional_stability_self: 50,
    })
    expect(r.status).toBe("computed")
    expect(r.coverage).toBe(1.0)
    expect(r.dimensions.length).toBe(5)
  })

  it("EC-2: extreme delta (Self=90, Fremd=10) is flagged", () => {
    const r = computeBig5Gap({
      ...baseBig5!,
      // override fremd to ensure 60% coverage with all 5 self
      openness_fremd: 10,
      conscientiousness_fremd: 10,
      extraversion_fremd: 10,
      agreeableness_fremd: 10,
      emotional_stability_fremd: 10,
      openness_self: 90,
      conscientiousness_self: 70,
      extraversion_self: 50,
      agreeableness_self: 60,
      emotional_stability_self: 50,
    })
    expect(r.flagged).toBe(true)
    expect(r.max_delta).toBeGreaterThanOrEqual(FLAG_DELTA_THRESHOLD)
  })
})
