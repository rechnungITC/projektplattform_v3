import { describe, expect, it } from "vitest"

import {
  ALLOWED_PHASE_TRANSITIONS,
  PHASE_STATUS_LABELS,
  PHASE_STATUSES,
  type PhaseStatus,
} from "./phase"

// PROJ-139 — guards the "suspended" core status + the FE transition map that
// must mirror the transition_phase_status DB function.
describe("PROJ-139 phase status: suspended", () => {
  it("includes suspended in the status union/list with a German label", () => {
    expect(PHASE_STATUSES).toContain("suspended")
    expect(PHASE_STATUS_LABELS.suspended).toBe("Ausgesetzt")
  })

  it("allows pause/resume and final-stop transitions (mirrors the DB RPC)", () => {
    // aussetzen
    expect(ALLOWED_PHASE_TRANSITIONS.in_progress).toContain("suspended")
    // fortsetzen + endgültig abbrechen
    expect(ALLOWED_PHASE_TRANSITIONS.suspended).toEqual(
      expect.arrayContaining(["in_progress", "cancelled"])
    )
  })

  it("does NOT allow suspended → completed / planned (rejected by the DB)", () => {
    expect(ALLOWED_PHASE_TRANSITIONS.suspended).not.toContain("completed")
    expect(ALLOWED_PHASE_TRANSITIONS.suspended).not.toContain("planned")
  })

  it("every status has a label and a (possibly empty) transition list", () => {
    for (const s of PHASE_STATUSES) {
      expect(PHASE_STATUS_LABELS[s as PhaseStatus]).toBeTruthy()
      expect(Array.isArray(ALLOWED_PHASE_TRANSITIONS[s as PhaseStatus])).toBe(true)
    }
  })
})
