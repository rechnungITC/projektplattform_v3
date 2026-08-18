import { describe, expect, it } from "vitest"

import {
  CONSTRUCTION_DEFECT_EVENT_LABELS,
  CONSTRUCTION_DEFECT_SEVERITY_LABELS,
  CONSTRUCTION_DEFECT_STATUS_LABELS,
  deriveDefectFlags,
  isDefectAwaitingReview,
  isDefectOverdue,
} from "./defects"
import {
  CONSTRUCTION_DEFECT_EVENT_TYPES,
  CONSTRUCTION_DEFECT_SEVERITIES,
  CONSTRUCTION_DEFECT_STATUSES,
} from "@/types/construction-defect"

/**
 * PROJ-45-β — the overdue rule has an authoritative twin in SQL
 * (`_construction_defect_is_overdue`). These cases pin the three boundaries that
 * decide whether the list and its own header can disagree: the day of the
 * deadline, the day after, and the day after in a status where the delay is no
 * longer the contractor's.
 */

const TODAY = "2026-08-18"

describe("isDefectOverdue", () => {
  it("is NOT overdue on the day the deadline falls due", () => {
    // The SQL twin uses `<`, not `<=` — it lapses tomorrow.
    expect(isDefectOverdue("offen", TODAY, TODAY)).toBe(false)
    expect(isDefectOverdue("in_bearbeitung", TODAY, TODAY)).toBe(false)
  })

  it("is overdue once the deadline has lapsed", () => {
    expect(isDefectOverdue("offen", "2026-08-17", TODAY)).toBe(true)
    expect(isDefectOverdue("in_bearbeitung", "2026-08-17", TODAY)).toBe(true)
  })

  it("is NOT overdue after completion was reported, even with a lapsed deadline", () => {
    // `erledigt` waits for the review; the delay would be the site management's,
    // so the overdue list would name the wrong party.
    expect(isDefectOverdue("erledigt", "2026-08-17", TODAY)).toBe(false)
    expect(isDefectAwaitingReview("erledigt")).toBe(true)
  })

  it("never marks a terminal status overdue", () => {
    expect(isDefectOverdue("geprueft", "2020-01-01", TODAY)).toBe(false)
    expect(isDefectOverdue("verworfen", "2020-01-01", TODAY)).toBe(false)
  })

  it("is never overdue without a deadline", () => {
    expect(isDefectOverdue("offen", null, TODAY)).toBe(false)
    expect(isDefectOverdue("in_bearbeitung", undefined, TODAY)).toBe(false)
  })

  it("treats an unknown status as not overdue rather than throwing", () => {
    expect(isDefectOverdue("nonsense", "2020-01-01", TODAY)).toBe(false)
    expect(isDefectOverdue(null, "2020-01-01", TODAY)).toBe(false)
  })

  it("falls back to the real today when no reference date is given", () => {
    const realToday = new Date().toISOString().slice(0, 10)
    expect(isDefectOverdue("offen", realToday)).toBe(false)
    expect(isDefectOverdue("offen", "2000-01-01")).toBe(true)
  })
})

describe("isDefectAwaitingReview", () => {
  it("is true only for the reported-done status", () => {
    for (const status of CONSTRUCTION_DEFECT_STATUSES) {
      expect(isDefectAwaitingReview(status)).toBe(status === "erledigt")
    }
  })
})

describe("deriveDefectFlags", () => {
  it("returns both flags for a lapsed open defect", () => {
    expect(
      deriveDefectFlags({ status: "offen", due_date: "2026-08-01" }, TODAY)
    ).toEqual({ isOverdue: true, isAwaitingReview: false })
  })

  it("swaps overdue for awaiting-review once completion is reported", () => {
    expect(
      deriveDefectFlags({ status: "erledigt", due_date: "2026-08-01" }, TODAY)
    ).toEqual({ isOverdue: false, isAwaitingReview: true })
  })

  it("returns no flags for a reviewed defect", () => {
    expect(
      deriveDefectFlags({ status: "geprueft", due_date: "2026-08-01" }, TODAY)
    ).toEqual({ isOverdue: false, isAwaitingReview: false })
  })
})

describe("label maps", () => {
  it("cover every severity, status and event type", () => {
    for (const s of CONSTRUCTION_DEFECT_SEVERITIES) {
      expect(CONSTRUCTION_DEFECT_SEVERITY_LABELS[s]).toBeTruthy()
    }
    for (const s of CONSTRUCTION_DEFECT_STATUSES) {
      expect(CONSTRUCTION_DEFECT_STATUS_LABELS[s]).toBeTruthy()
    }
    for (const e of CONSTRUCTION_DEFECT_EVENT_TYPES) {
      expect(CONSTRUCTION_DEFECT_EVENT_LABELS[e]).toBeTruthy()
    }
  })

  it("distinguishes the reported-done status from a plain 'done'", () => {
    // The UI must not read `erledigt` as finished — the review is still pending.
    expect(CONSTRUCTION_DEFECT_STATUS_LABELS.erledigt).toBe("Fertiggemeldet")
    expect(CONSTRUCTION_DEFECT_STATUS_LABELS.geprueft).toBe("Geprüft")
  })
})
