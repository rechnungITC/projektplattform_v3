/**
 * PROJ-70-ε — AC-ε6: visibleWizardSteps + ki_backlog draft round-trip.
 */

import { describe, expect, it } from "vitest"

import {
  WIZARD_STEPS,
  emptyKiBacklogData,
  emptySkillsWizardData,
  emptyWizardData,
  visibleWizardSteps,
  type WizardData,
} from "./wizard"

describe("visibleWizardSteps — AC-ε1 conditional step", () => {
  it("omits ki_backlog when the toggle is off", () => {
    const steps = visibleWizardSteps(false)
    expect(steps).not.toContain("ki_backlog")
    // PROJ-78 — the unconditional "skills" step sits between followups and review.
    expect(steps).toEqual([
      "basics",
      "type",
      "method",
      "followups",
      "skills",
      "project_context",
      "review",
    ])
  })

  it("includes ki_backlog (after skills, before review) when on", () => {
    const steps = visibleWizardSteps(true)
    expect(steps).toContain("ki_backlog")
    expect(steps.indexOf("ki_backlog")).toBe(steps.indexOf("skills") + 1)
    expect(steps.indexOf("skills")).toBe(steps.indexOf("followups") + 1)
  })

  it("preserves the canonical order of the other steps in both modes", () => {
    for (const enabled of [true, false]) {
      // project_type 'ma' includes ma_foundation; project_context is always
      // present. Order is checked against the full catalog minus ki_backlog.
      const steps = visibleWizardSteps(enabled, "ma", true)
      const withoutKi = steps.filter((s) => s !== "ki_backlog")
      expect(withoutKi).toEqual(
        WIZARD_STEPS.filter((s) => s !== "ki_backlog"),
      )
    }
  })
})

describe("visibleWizardSteps — PROJ-94 M&A conditional step", () => {
  it("omits ma_foundation for non-M&A types", () => {
    expect(visibleWizardSteps(false, "erp")).not.toContain("ma_foundation")
    expect(visibleWizardSteps(false, null)).not.toContain("ma_foundation")
    // Back-compat: callers passing only the ki flag never see ma_foundation.
    expect(visibleWizardSteps(false)).not.toContain("ma_foundation")
  })

  it("includes ma_foundation (after skills) for project_type 'ma'", () => {
    const steps = visibleWizardSteps(false, "ma")
    expect(steps).toContain("ma_foundation")
    // PROJ-78 — the "skills" step was inserted between followups and ma_foundation.
    expect(steps.indexOf("ma_foundation")).toBe(steps.indexOf("skills") + 1)
    // The shared context step follows every type-specific foundation.
    expect(steps.indexOf("project_context")).toBe(
      steps.indexOf("ma_foundation") + 1,
    )
  })

  it("places ma_foundation before ki_backlog when both are active", () => {
    const steps = visibleWizardSteps(true, "ma")
    expect(steps).toContain("ma_foundation")
    expect(steps).toContain("ki_backlog")
    expect(steps.indexOf("ma_foundation")).toBeLessThan(
      steps.indexOf("ki_backlog"),
    )
  })
})

describe("visibleWizardSteps — PROJ-Y-5a unified project context", () => {
  it("includes project context with and without a kickoff", () => {
    expect(visibleWizardSteps(true, null, false)).toContain("project_context")
    expect(visibleWizardSteps(false, null, true)).toContain("project_context")
  })

  it("places project context after the optional kickoff and before review", () => {
    const steps = visibleWizardSteps(true, null, true)
    expect(steps.indexOf("project_context")).toBe(
      steps.indexOf("ki_backlog") + 1,
    )
    expect(steps.indexOf("project_context")).toBe(
      steps.indexOf("review") - 1,
    )
  })

  it("absorbs the old visible clarifying step", () => {
    const steps = visibleWizardSteps(true, null, true)
    expect(steps).not.toContain("clarifying")
    expect(steps).toContain("ki_backlog")
    expect(visibleWizardSteps(false, null, true)).toContain("project_context")
  })
})

describe("emptyWizardData — ki_backlog defaults", () => {
  it("starts with the KI-backlog block disabled and empty", () => {
    const data = emptyWizardData("11111111-1111-1111-1111-111111111111")
    expect(data.ki_backlog).toEqual({
      enabled: false,
      context_source_id: null,
      filename: null,
    })
  })

  it("emptyKiBacklogData matches the empty wizard default", () => {
    const data = emptyWizardData("u")
    expect(data.ki_backlog).toEqual(emptyKiBacklogData())
  })
})

describe("ki_backlog draft round-trip (AC-ε6)", () => {
  it("survives a JSON serialize/parse cycle (draft persistence shape)", () => {
    const data: WizardData = {
      ...emptyWizardData("u"),
      name: "ERP Rollout",
      ki_backlog: {
        enabled: true,
        context_source_id: "22222222-2222-2222-2222-222222222222",
        filename: "kickoff.eml",
      },
    }
    const roundTripped = JSON.parse(JSON.stringify(data)) as WizardData
    expect(roundTripped.ki_backlog).toEqual(data.ki_backlog)
    // The active flow derived from the round-tripped toggle includes the step.
    expect(visibleWizardSteps(roundTripped.ki_backlog.enabled)).toContain(
      "ki_backlog",
    )
  })

  it("a disabled block round-trips to a 7-step flow", () => {
    const data = emptyWizardData("u")
    const roundTripped = JSON.parse(JSON.stringify(data)) as WizardData
    // basics, type, method, followups, skills, project_context, review.
    expect(visibleWizardSteps(roundTripped.ki_backlog.enabled)).toHaveLength(7)
  })
})

describe("PROJ-78 — unconditional skills step", () => {
  it("is always part of the flow, regardless of the conditional toggles", () => {
    for (const kiEnabled of [true, false]) {
      for (const type of ["ma", "erp", null] as const) {
        for (const kickoff of [true, false]) {
          expect(visibleWizardSteps(kiEnabled, type, kickoff)).toContain(
            "skills",
          )
        }
      }
    }
  })

  it("sits directly after the followups step", () => {
    const steps = visibleWizardSteps(true, "ma", true)
    expect(steps.indexOf("skills")).toBe(steps.indexOf("followups") + 1)
  })

  it("starts with an empty assignment list", () => {
    const data = emptyWizardData("11111111-1111-1111-1111-111111111111")
    expect(data.skills).toEqual(emptySkillsWizardData())
    expect(data.skills.assignments).toEqual([])
  })

  it("starts with a manual-capable empty project context", () => {
    const data = emptyWizardData("11111111-1111-1111-1111-111111111111")
    expect(data.project_context.analysis_status).toBe(
      "captured_not_ai_analyzed",
    )
    expect(data.project_context.skill_coverage).toEqual([])
    expect(data.project_context.finished).toBe(false)
  })

  it("survives the draft JSON round-trip", () => {
    const data: WizardData = {
      ...emptyWizardData("u"),
      skills: {
        assignments: [
          {
            skill_id: "33333333-3333-3333-3333-333333333333",
            assignment_source: "auto_method",
          },
          {
            skill_id: "44444444-4444-4444-4444-444444444444",
            assignment_source: "manual_pm",
          },
        ],
      },
    }
    const roundTripped = JSON.parse(JSON.stringify(data)) as WizardData
    expect(roundTripped.skills).toEqual(data.skills)
  })
})
