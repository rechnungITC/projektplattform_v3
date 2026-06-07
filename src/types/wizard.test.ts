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
    expect(steps.indexOf("ki_backlog")).toBe(steps.indexOf("review") - 1)
  })

  it("preserves the canonical order of the other steps in both modes", () => {
    for (const enabled of [true, false]) {
      const steps = visibleWizardSteps(enabled)
      const withoutKi = steps.filter((s) => s !== "ki_backlog")
      expect(withoutKi).toEqual(
        WIZARD_STEPS.filter((s) => s !== "ki_backlog"),
      )
    }
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
