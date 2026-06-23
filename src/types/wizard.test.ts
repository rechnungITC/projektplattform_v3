/**
 * PROJ-70-ε — AC-ε6: visibleWizardSteps + ki_backlog draft round-trip.
 */

import { describe, expect, it } from "vitest"

import {
  WIZARD_STEPS,
  emptyKiBacklogData,
  emptyWizardData,
  visibleWizardSteps,
  type WizardData,
} from "./wizard"

describe("visibleWizardSteps — AC-ε1 conditional step", () => {
  it("omits ki_backlog when the toggle is off", () => {
    const steps = visibleWizardSteps(false)
    expect(steps).not.toContain("ki_backlog")
    expect(steps).toEqual(["basics", "type", "method", "followups", "review"])
  })

  it("includes ki_backlog (after followups, before review) when on", () => {
    const steps = visibleWizardSteps(true)
    expect(steps).toContain("ki_backlog")
    expect(steps.indexOf("ki_backlog")).toBe(steps.indexOf("followups") + 1)
  })

  it("preserves the canonical order of the other steps in both modes", () => {
    for (const enabled of [true, false]) {
      // project_type 'ma' + kickoffUploaded=true so ma_foundation AND clarifying
      // are both present; order is checked against the full catalog minus the
      // ki_backlog toggle.
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

  it("includes ma_foundation (after followups) for project_type 'ma'", () => {
    const steps = visibleWizardSteps(false, "ma")
    expect(steps).toContain("ma_foundation")
    expect(steps.indexOf("ma_foundation")).toBe(steps.indexOf("followups") + 1)
    // With ki_backlog off and no kickoff uploaded, ma_foundation is the last
    // step before review.
    expect(steps.indexOf("ma_foundation")).toBe(steps.indexOf("review") - 1)
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

describe("visibleWizardSteps — PROJ-135 clarifying step (AC-135.3)", () => {
  it("omits clarifying when no kickoff was uploaded", () => {
    expect(visibleWizardSteps(true, null, false)).not.toContain("clarifying")
    expect(visibleWizardSteps(false, null, false)).not.toContain("clarifying")
  })

  it("includes clarifying (after ki_backlog, before review) once a kickoff is uploaded", () => {
    const steps = visibleWizardSteps(true, null, true)
    expect(steps).toContain("clarifying")
    expect(steps.indexOf("clarifying")).toBe(steps.indexOf("ki_backlog") + 1)
    expect(steps.indexOf("clarifying")).toBe(steps.indexOf("review") - 1)
  })

  it("can show clarifying even if the ki_backlog toggle filter is off but a source exists", () => {
    // Defensive: kickoffUploaded drives clarifying independently of the toggle.
    const steps = visibleWizardSteps(false, null, true)
    expect(steps).toContain("clarifying")
    expect(steps).not.toContain("ki_backlog")
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

  it("a disabled block round-trips to a 5-step flow", () => {
    const data = emptyWizardData("u")
    const roundTripped = JSON.parse(JSON.stringify(data)) as WizardData
    expect(visibleWizardSteps(roundTripped.ki_backlog.enabled)).toHaveLength(5)
  })
})
